/* 行者无疆 · site interactions
   vanilla, no dependencies. everything is progressive enhancement. */
(function () {
  "use strict";

  var doc = document;
  var body = doc.body;
  var BASE = body ? body.getAttribute("data-base") || "" : "";
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var resetFilters = null;

  function $(sel, root) {
    return (root || doc).querySelector(sel);
  }
  function $$(sel, root) {
    return Array.prototype.slice.call((root || doc).querySelectorAll(sel));
  }
  function on(el, ev, fn, opts) {
    if (el) el.addEventListener(ev, fn, opts || false);
  }
  function raf(fn) {
    return window.requestAnimationFrame(fn);
  }
  function throttle(fn, wait) {
    var last = 0,
      timer = null;
    return function () {
      var now = Date.now();
      var args = arguments;
      var self = this;
      if (now - last >= wait) {
        last = now;
        fn.apply(self, args);
      } else if (!timer) {
        timer = setTimeout(function () {
          timer = null;
          last = Date.now();
          fn.apply(self, args);
        }, wait - (now - last));
      }
    };
  }

  /* One overlay at a time; restore only the inert states we changed. */
  var overlays = (function () {
    var active = null;
    var background = [];
    var wasLocked = false;
    var focusables = 'a[href], button, input, select, textarea, [tabindex]';

    function available(el) {
      return el && el.isConnected && !el.disabled && !el.closest("[inert]") &&
        el.getClientRects().length && window.getComputedStyle(el).visibility !== "hidden";
    }
    function focus(el) {
      if (available(el)) el.focus({ preventScroll: true });
    }
    function tabs(el) {
      return $$(focusables, el).filter(function (item) {
        return item.tabIndex >= 0 && available(item);
      });
    }
    function register(el, label) {
      if (!el) return;
      el.setAttribute("inert", "");
      el.setAttribute("aria-hidden", "true");
      el.setAttribute("role", "dialog");
      el.setAttribute("aria-modal", "true");
      if (!el.hasAttribute("aria-label") && label) el.setAttribute("aria-label", label);
      if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
    }
    function close(el, restore) {
      if (!active || active.el !== el) return;
      var old = active;
      active = null;
      if (old.cancelFocus) old.cancelFocus();
      background.forEach(function (item) {
        if (item.value === null) item.el.removeAttribute("inert");
        else item.el.setAttribute("inert", item.value);
      });
      background = [];
      body.classList.toggle("is-locked", wasLocked);
      if (restore !== false && available(old.trigger)) focus(old.trigger);
      if (el.contains(doc.activeElement)) doc.activeElement.blur();
      el.classList.remove("is-open");
      el.setAttribute("aria-hidden", "true");
      el.setAttribute("inert", "");
      if (old.closed) old.closed();
    }
    function open(el, trigger, initial, closed) {
      if (active && active.el === el) return false;
      trigger = trigger || doc.activeElement;
      if (active) {
        // A shortcut inside an overlay returns to that overlay's original opener.
        if (!trigger || active.el.contains(trigger)) trigger = active.trigger;
        close(active.el, false);
      }
      active = { el: el, trigger: trigger, initial: initial, closed: closed };
      wasLocked = body.classList.contains("is-locked");
      el.removeAttribute("inert");
      el.setAttribute("aria-hidden", "false");
      el.classList.add("is-open");
      // Inert siblings along the ancestor path also supports nested overlays.
      for (var branch = el; branch && branch !== body; branch = branch.parentElement) {
        if (!branch.parentElement) break;
        Array.prototype.forEach.call(branch.parentElement.children, function (sibling) {
          if (sibling === branch) return;
          background.push({ el: sibling, value: sibling.getAttribute("inert") });
          sibling.setAttribute("inert", "");
        });
      }
      body.classList.add("is-locked");
      focus(initial || tabs(el)[0] || el);
      // Visibility can remain in transition beyond the first rendered frame.
      var opening = active;
      function retryFocus() {
        if (active === opening && !el.contains(doc.activeElement)) {
          focus(initial || tabs(el)[0] || el);
        }
      }
      function afterTransition(e) {
        if (e.target === el) retryFocus();
      }
      function milliseconds(value) {
        return (parseFloat(value) || 0) * (value.indexOf("ms") >= 0 ? 1 : 1000);
      }
      var style = window.getComputedStyle(el);
      var delays = style.transitionDelay.split(",");
      var wait = 0;
      style.transitionDuration.split(",").forEach(function (duration, i) {
        wait = Math.max(wait, milliseconds(duration) + milliseconds(delays[i % delays.length]));
      });
      el.addEventListener("transitionend", afterTransition);
      var focusTimer = setTimeout(function () {
        retryFocus();
        opening.cancelFocus();
      }, wait + 60);
      opening.cancelFocus = function () {
        clearTimeout(focusTimer);
        el.removeEventListener("transitionend", afterTransition);
      };
      raf(retryFocus);
      return true;
    }
    on(doc, "keydown", function (e) {
      if (!active) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close(active.el);
      } else if (e.key === "Tab") {
        var list = tabs(active.el);
        var index = list.indexOf(doc.activeElement);
        if (!list.length || index < 0 || (e.shiftKey && index === 0) ||
            (!e.shiftKey && index === list.length - 1)) {
          e.preventDefault();
          focus(list.length ? list[e.shiftKey ? list.length - 1 : 0] : active.el);
        }
      }
    }, true);
    on(doc, "focusin", function (e) {
      if (active && !active.el.contains(e.target)) {
        focus(active.initial || tabs(active.el)[0] || active.el);
      }
    });
    return { register: register, open: open, close: close, isOpen: function (el) {
      return !!active && active.el === el;
    } };
  })();

  /* ------------------------------------------------------------ nav */
  function initNav() {
    var nav = $("[data-nav]");
    if (nav) {
      var solid = nav.classList.contains("nav--solid");
      var update = function () {
        var y = window.scrollY || window.pageYOffset;
        if (!solid) nav.classList.toggle("is-scrolled", y > 24);
      };
      update();
      on(window, "scroll", throttle(update, 60), { passive: true });
    }

    var drawer = $("[data-drawer]");
    var burger = $("[data-burger]");
    var closeBtn = $("[data-drawer-close]");
    overlays.register(drawer, "网站导航");
    on(burger, "click", function () {
      if (drawer && overlays.open(drawer, burger, closeBtn, function () {
        burger.setAttribute("aria-expanded", "false");
      })) burger.setAttribute("aria-expanded", "true");
    });
    on(closeBtn, "click", function () {
      overlays.close(drawer);
    });
    $$("[data-drawer] a").forEach(function (a) {
      on(a, "click", function () {
        overlays.close(drawer);
      });
    });

    // mark current nav item
    var path = location.pathname.split("/").pop() || "index.html";
    var page = body.getAttribute("data-page");
    if (page === "project") path = "projects.html";
    if (page === "post") path = "archive.html";
    $$(".nav__links a, .drawer__links a").forEach(function (a) {
      var href = (a.getAttribute("href") || "").split("/").pop();
      var current = href === path;
      a.classList.toggle("is-active", current);
      if (current) a.setAttribute("aria-current", page === "project" || page === "post" ? "location" : "page");
      else a.removeAttribute("aria-current");
    });
  }

  /* ------------------------------------------------------------ reveal */
  function initReveal() {
    var items = $$("[data-reveal]");
    if (!items.length) return;
    if (reduceMotion || !("IntersectionObserver" in window)) {
      items.forEach(function (el) {
        el.classList.add("is-in");
      });
      return;
    }
    // stagger children inside the same parent group
    var groups = {};
    items.forEach(function (el) {
      var key = el.parentElement ? Array.prototype.indexOf.call(
        el.parentElement.children, el
      ) : 0;
      var gk = el.getAttribute("data-reveal-group") || "";
      if (gk) {
        groups[gk] = (groups[gk] || 0) + 1;
        el.style.transitionDelay = Math.min(groups[gk] * 70, 560) + "ms";
      } else if (key > 0 && key < 12) {
        el.style.transitionDelay = Math.min(key * 55, 420) + "ms";
      }
    });
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.04 }
    );
    items.forEach(function (el) {
      io.observe(el);
    });
  }

  /* ------------------------------------------------------------ counters */
  function initCounters() {
    var nums = $$("[data-counter]");
    if (!nums.length) return;
    var run = function (el) {
      var target = parseFloat(el.getAttribute("data-counter")) || 0;
      if (reduceMotion) {
        el.textContent = target;
        return;
      }
      var start = performance.now();
      var dur = 1200;
      var step = function (t) {
        var p = Math.min((t - start) / dur, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * eased);
        if (p < 1) raf(step);
      };
      raf(step);
    };
    if (!("IntersectionObserver" in window)) {
      nums.forEach(run);
      return;
    }
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            run(e.target);
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.5 }
    );
    nums.forEach(function (el) {
      io.observe(el);
    });
  }

  /* ------------------------------------------------------------ back to top */
  function initTop() {
    var btn = $("[data-totop]");
    if (!btn) return;
    var update = function () {
      btn.classList.toggle("is-visible", (window.scrollY || 0) > 900);
    };
    update();
    on(window, "scroll", throttle(update, 120), { passive: true });
    on(btn, "click", function () {
      window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    });
  }

  /* ------------------------------------------------------------ progress */
  function initProgress() {
    var bar = $("[data-progress]");
    if (!bar) return;
    var update = function () {
      var h = doc.documentElement.scrollHeight - window.innerHeight;
      var p = h > 0 ? (window.scrollY / h) * 100 : 0;
      bar.style.width = Math.min(100, Math.max(0, p)) + "%";
    };
    update();
    on(window, "scroll", throttle(update, 40), { passive: true });
    on(window, "resize", throttle(update, 200));
  }

  /* ------------------------------------------------------------ lightbox */
  function initLightbox() {
    var lb = $("[data-lightbox]");
    if (!lb) return;
    var imgEl = $("[data-lb-img]", lb);
    var capEl = $("[data-lb-cap]", lb);
    var idxEl = $("[data-lb-idx]", lb);
    var prev = $("[data-lb-prev]", lb);
    var next = $("[data-lb-next]", lb);
    var list = [];
    var cur = 0;
    overlays.register(lb, "放大图片");

    function open(items, index, trigger) {
      if (!items.length || index < 0 || overlays.isOpen(lb)) return false;
      list = items;
      cur = index;
      render();
      return overlays.open(lb, trigger, $("[data-lb-close]", lb), function () {
        imgEl.removeAttribute("src");
      });
    }
    function render() {
      var it = list[cur];
      if (!it) return;
      imgEl.src = it.full;
      imgEl.alt = it.cap || "";
      capEl.textContent = it.cap || "";
      idxEl.textContent = cur + 1 + " / " + list.length;
      var multi = list.length > 1;
      prev.style.display = multi ? "" : "none";
      next.style.display = multi ? "" : "none";
    }
    function close() {
      overlays.close(lb);
    }
    function go(dir) {
      if (!list.length) return;
      cur = (cur + dir + list.length) % list.length;
      render();
    }
    on($("[data-lb-close]", lb), "click", close);
    on(prev, "click", function () {
      go(-1);
    });
    on(next, "click", function () {
      go(1);
    });
    on(lb, "click", function (e) {
      if (e.target === lb || e.target.classList.contains("lb__stage")) close();
    });
    on(doc, "keydown", function (e) {
      if (!overlays.isOpen(lb)) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        go(e.key === "ArrowLeft" ? -1 : 1);
      }
    });

    // collect article images
    var proseImgs = $$(".prose img").filter(function (im) {
      return im.getAttribute("src");
    });
    proseImgs.forEach(function (im) {
      im.classList.add("js-lightbox");
      im.setAttribute("tabindex", "0");
      im.setAttribute("role", "button");
      im.setAttribute("aria-label", "放大图片：" + (im.alt || "文章图片"));
    });
    $$("[data-gallery] figure").forEach(function (figure) {
      var img = $("img", figure);
      figure.setAttribute("tabindex", "0");
      figure.setAttribute("role", "button");
      figure.setAttribute("aria-label", "放大图片：" + (figure.getAttribute("data-cap") || (img && img.alt) || "影像"));
    });
    function activateImage(t) {
      if (!t || t.nodeType !== 1) return false;
      var figure = t.closest ? t.closest("[data-gallery] figure") : null;
      if (figure && !figure.classList.contains("is-hidden")) {
        var figures = $$("[data-gallery] figure").filter(function (f) {
          return !f.classList.contains("is-hidden");
        });
        var items = figures.map(function (f) {
          var img = f.querySelector("img");
          return {
            full: f.getAttribute("data-full") || (img ? img.src : ""),
            cap: f.getAttribute("data-cap") || (img ? img.alt : "")
          };
        });
        return open(items, figures.indexOf(figure), figure);
      }
      if (t.classList.contains("js-lightbox") || (t.tagName === "IMG" && t.parentNode && t.parentNode.closest && t.parentNode.closest(".prose"))) {
        if (!t.classList.contains("js-lightbox") && t.tagName === "IMG") t.classList.add("js-lightbox");
        var items2 = proseImgs.map(function (im) {
          return { full: im.getAttribute("src"), cap: im.alt || "" };
        });
        return open(items2, proseImgs.indexOf(t), t);
      }
      return false;
    }
    on(doc, "click", function (e) {
      if (activateImage(e.target)) e.preventDefault();
    });
    on(doc, "keydown", function (e) {
      if (!e.repeat && (e.key === "Enter" || e.key === " ") && activateImage(e.target)) e.preventDefault();
    });
  }

  /* ------------------------------------------------------------ filters (archive / chronicle / gallery) */
  function initFilters() {
    var bars = $$("[data-filterbar]");
    if (!bars.length) return;
    var items = $$("[data-filter-item]");
    var searches = $$("[data-filter-search]");
    var state = { q: "" };
    var timer = null;
    bars.forEach(function (bar) {
      state[bar.getAttribute("data-filterbar") || "series"] = "all";
    });

    function matches(el) {
      for (var i = 0; i < bars.length; i++) {
        var g = bars[i].getAttribute("data-filterbar") || "series";
        var want = state[g];
        if (want && want !== "all" && (el.getAttribute("data-" + g) || "").split(" ").indexOf(want) < 0) {
          return false;
        }
      }
      if (state.q && (el.getAttribute("data-text") || "").toLowerCase().indexOf(state.q) < 0) return false;
      return true;
    }

    function apply() {
      var shown = 0;
      items.forEach(function (el) {
        var show = matches(el);
        el.classList.toggle("is-hidden", !show);
        if (show) shown++;
      });
      $$("[data-filter-count]").forEach(function (el) {
        el.textContent = shown;
      });
      // category sections on the archive page
      $$("[data-group-section]").forEach(function (grp) {
        var vis = 0;
        $$("[data-filter-item]", grp).forEach(function (it) {
          if (!it.classList.contains("is-hidden")) vis++;
        });
        $$("[data-group-count]", grp).forEach(function (c) {
          c.textContent = vis;
        });
        grp.classList.toggle("is-hidden", vis === 0);
      });
      // collapse timeline year groups that have no visible items
      $$("[data-year-group]").forEach(function (grp) {
        var vis = 0;
        $$("[data-filter-item]", grp).forEach(function (it) {
          if (!it.classList.contains("is-hidden")) vis++;
        });
        grp.classList.toggle("is-hidden", vis === 0);
      });
      var empty = $("[data-filter-empty]");
      if (empty) empty.style.display = shown === 0 ? "" : "none";
    }

    function setFacet(bar, value) {
      state[bar.getAttribute("data-filterbar") || "series"] = value;
      $$("[data-filter]", bar).forEach(function (btn) {
        var selected = (btn.getAttribute("data-filter") || "all") === value;
        btn.classList.toggle("is-active", selected);
        btn.setAttribute("aria-pressed", selected ? "true" : "false");
      });
    }
    resetFilters = function () {
      clearTimeout(timer);
      state.q = "";
      searches.forEach(function (input) { input.value = ""; });
      bars.forEach(function (bar) { setFacet(bar, "all"); });
      apply();
    };
    bars.forEach(function (bar) {
      $$("[data-filter]", bar).forEach(function (btn) {
        on(btn, "click", function () {
          setFacet(bar, btn.getAttribute("data-filter") || "all");
          apply();
        });
      });
    });

    if (searches.length) {
      searches.forEach(function (input) {
        on(input, "input", function () {
          clearTimeout(timer);
          timer = setTimeout(function () {
            state.q = (input.value || "").trim().toLowerCase();
            searches.forEach(function (other) {
              if (other !== input && other.value !== input.value) other.value = input.value;
            });
            apply();
          }, 120);
        });
      });
    }

    // horizontal chip rails: arrow buttons appear only when content overflows
    $$("[data-rail]").forEach(function (rail) {
      var track = $("[data-rail-track]", rail);
      var prev = $("[data-rail-prev]", rail);
      var next = $("[data-rail-next]", rail);
      if (!track) return;
      function sync() {
        var over = track.scrollWidth - track.clientWidth > 4;
        if (prev) prev.hidden = !over || track.scrollLeft < 4;
        if (next) next.hidden = !over || track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
        var atStart = track.scrollLeft < 4;
        var atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
        rail.classList.toggle('is-overflow', over);
        rail.classList.toggle('at-start', over && atStart);
        rail.classList.toggle('at-end', over && atEnd);
      }
      function step(dir) {
        track.scrollLeft += dir * Math.max(160, track.clientWidth * 0.72);
      }
      if (prev) on(prev, "click", function () { step(-1); });
      if (next) on(next, "click", function () { step(1); });
      on(track, "scroll", sync, { passive: true });
      on(window, "resize", sync);
      setTimeout(sync, 60);
      sync();
    });

    resetFilters();
    if (body.getAttribute("data-page") === "archive") {
      var series = new URLSearchParams(location.search).get("series");
      if (series && items.some(function (item) {
        return (item.getAttribute("data-series") || "").split(" ").indexOf(series) >= 0;
      })) {
        bars.forEach(function (bar) {
          if (bar.getAttribute("data-filterbar") === "series" && $$("[data-filter]", bar).some(function (btn) {
            return btn.getAttribute("data-filter") === series;
          })) setFacet(bar, series);
        });
        apply();
      }
    }
  }

  /* ------------------------------------------------------------ archive sort */
  function initSort() {
    var btn = $("[data-sort]");
    var lists = $$("[data-sort-list]");
    if (!btn || !lists.length) return;
    var asc = btn.getAttribute("data-sort") === "asc";
    on(btn, "click", function () {
      asc = !asc;
      lists.forEach(function (list) {
        var kids = Array.prototype.slice.call(list.children);
        kids.sort(function (a, b) {
          var da = a.getAttribute("data-date") || "";
          var db = b.getAttribute("data-date") || "";
          return asc ? (da < db ? -1 : da > db ? 1 : 0) : da > db ? -1 : da < db ? 1 : 0;
        });
        kids.forEach(function (k) {
          list.appendChild(k);
        });
      });
      btn.textContent = asc ? "时间 ↑ 由远及近" : "时间 ↓ 由近及远";
    });
  }

  /* ------------------------------------------------------------ search */
  function initSearch() {
    var modal = $("[data-search]");
    if (!modal) return;
    var input = $("[data-search-input]", modal);
    var results = $("[data-search-results]", modal);
    var hint = $("[data-search-hint]");
    var openers = $$("[data-search-open]");
    var data = null;
    var loading = false;
    var cur = -1;
    overlays.register(modal, "站内搜索");

    function load(cb) {
      if (data) return cb();
      if (loading) return;
      loading = true;
      fetch(BASE + "assets/data/search.json")
        .then(function (r) {
          return r.json();
        })
        .then(function (json) {
          data = json.map(function (p) {
            return {
              t: p[0],
              d: p[1],
              s: p[2],
              c: p[3],
              u: BASE + p[4],
              x: p[5] || "",
              lc: p[0].toLowerCase() + " " + (p[5] || "").toLowerCase()
            };
          });
          loading = false;
          cb();
        })
        .catch(function () {
          loading = false;
          if (results) results.innerHTML = '<div class="search-modal__empty">索引加载失败，请稍后重试。</div>';
        });
    }

    function esc(s) {
      return String(s || "").replace(/[&<>"]/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
      });
    }
    function hl(text, q) {
      if (!q) return esc(text);
      var i = text.toLowerCase().indexOf(q);
      if (i < 0) return esc(text);
      return (
        esc(text.slice(0, i)) +
        "<em>" +
        esc(text.slice(i, i + q.length)) +
        "</em>" +
        esc(text.slice(i + q.length))
      );
    }

    function render(q) {
      cur = -1;
      if (!q) {
        var hot = (data || []).slice(0, 6);
        results.innerHTML = hot
          .map(function (p) {
            return row(p, "");
          })
          .join("");
        if (hint) hint.textContent = "试试搜索：敦煌、剪纸、宏村、长安、荣昌…";
        return;
      }
      var list = data.filter(function (p) {
        return p.lc.indexOf(q) >= 0;
      });
      var top = list.slice(0, 40);
      if (!top.length) {
        results.innerHTML = '<div class="search-modal__empty">没有找到与「' + esc(q) + "」相关的推文。</div>";
      } else {
        results.innerHTML = top.map(function (p) {
          return row(p, q);
        }).join("");
      }
      if (hint) hint.textContent = "共 " + list.length + " 条结果";
    }
    function row(p, q) {
      return (
        '<a class="sresult" href="' + p.u + '"><time>' + esc(p.d) +
        "</time><span><b>" + hl(p.t, q) + "</b><small>" + esc(p.s) +
        " · " + esc(p.c) + "</small></span></a>"
      );
    }

    function openModal(trigger) {
      if (!overlays.open(modal, trigger, input)) return;
      load(function () {
        if (overlays.isOpen(modal)) render((input.value || "").trim().toLowerCase());
      });
    }
    function closeModal() {
      overlays.close(modal);
    }
    function move(dir) {
      var rows = $$(".sresult", results);
      if (!rows.length) return;
      cur = (cur + dir + rows.length) % rows.length;
      rows.forEach(function (r, i) {
        r.classList.toggle("is-cur", i === cur);
      });
      rows[cur].scrollIntoView({ block: "nearest" });
    }

    openers.forEach(function (b) {
      on(b, "click", function (e) {
        e.preventDefault();
        openModal(b);
      });
    });
    on($("[data-search-close]", modal), "click", closeModal);
    on(modal, "click", function (e) {
      if (e.target === modal) closeModal();
    });
    var timer = null;
    on(input, "input", function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        load(function () {
          render((input.value || "").trim().toLowerCase());
        });
      }, 130);
    });
    on(input, "keydown", function (e) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        move(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        move(-1);
      } else if (e.key === "Enter") {
        var rows = $$(".sresult", results);
        var target = rows[cur >= 0 ? cur : 0];
        if (target) {
          e.preventDefault();
          location.href = target.getAttribute("href");
        }
      }
    });
    on(doc, "keydown", function (e) {
      var tag = (e.target && e.target.tagName) || "";
      var typing = tag === "INPUT" || tag === "TEXTAREA" || (e.target && e.target.isContentEditable);
      if (!e.isComposing && ((e.key === "/" && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k"))) {
        e.preventDefault();
        openModal(doc.activeElement);
      }
    });
  }

  /* ------------------------------------------------------------ misc */
  function initSmoothAnchors() {
    $$('a[href^="#"]').forEach(function (a) {
      if (a.hasAttribute("data-year-link")) return;
      var id = a.getAttribute("href");
      if (!id || id === "#" || id.length < 2) return;
      var target = doc.getElementById(id.slice(1));
      if (!target) return;
      on(a, "click", function (e) {
        e.preventDefault();
        var top = target.getBoundingClientRect().top + window.scrollY - 90;
        window.scrollTo({ top: top, behavior: reduceMotion ? "auto" : "smooth" });
        if (a.classList.contains("skip-link")) {
          target.setAttribute("tabindex", "-1");
          target.focus({ preventScroll: true });
        }
      });
    });
  }

  function initYearPills() {
    $$("[data-year-link]").forEach(function (a) {
      on(a, "click", function (e) {
        var y = a.getAttribute("data-year-link");
        var el = doc.getElementById("y" + y);
        if (!el) return;
        e.preventDefault();
        if (resetFilters) resetFilters();
        var top = el.getBoundingClientRect().top + window.scrollY - 80;
        window.scrollTo({ top: top, behavior: reduceMotion ? "auto" : "smooth" });
      });
    });
  }

  /* ------------------------------------------------------- name cloud */
  // Lays every walker out as a loose, hand-set constellation instead of a
  // rigid grid. Names drift very slowly, reveal staggered on scroll, and the
  // legend line doubles as a readout when a name is hovered.
  function initNameCloud() {
    var box = $("[data-namecloud]");
    if (!box) return;
    var stack = $("[data-name-stack]", box);
    var read = $("[data-name-read]", box);
    if (!stack) return;
    var items = $$(".nw", stack);
    if (!items.length) return;
    var defaultRead = read ? read.textContent : "";
    var fontsDone = false;

    function layout() {
      var w = stack.clientWidth;
      if (!w) return false;
      stack.classList.add("is-cloud");
      items.forEach(function (el) {
        el.style.left = "0px";
        el.style.top = "0px";
      });
      var narrow = w < 640;
      var gapMin = narrow ? 12 : 20;
      var gapMax = narrow ? 30 : 62;
      var drift = narrow ? 6 : 12;
      var rowGap = narrow ? 18 : 22;
      var x = 0, y = 0, rowH = 0, n = 0;
      items.forEach(function (el, i) {
        var iw = el.offsetWidth;
        var ih = el.offsetHeight;
        var pad = 6;
        if (iw && x > 0 && x + iw > w - pad) {
          x = 0;
          y += Math.round(rowH * 0.95) + rowGap;
          rowH = 0;
        }
        // deterministic pseudo-random jitter: no two neighbours share a baseline
        var jy = (((i * 61) % 100) / 100 - 0.5) * 2 * drift;
        var jx = ((i * 43) % 100) / 100 * 10;
        if (n === 0 && y > 0) {
          x = ((i * 29) % (narrow ? 22 : 58));
        }
        el.style.left = Math.max(0, Math.round(x + jx)) + "px";
        el.style.top = Math.max(0, Math.round(y + jy)) + "px";
        el.style.setProperty("--d", Math.min(760, n * 24) + "ms");
        el.style.setProperty("--fy", (3 + (i % 5)) + "px");
        el.style.setProperty("--fd", (5 + (i % 6)) + "s");
        el.style.setProperty("--fdel", "-" + (((i * 7) % 13) * 0.7).toFixed(1) + "s");
        var gap = gapMin + (((i * 37) % 100) / 100) * (gapMax - gapMin);
        x += iw + gap;
        rowH = Math.max(rowH, ih);
        n++;
      });
      stack.style.height = Math.round(y + rowH + drift + 26) + "px";
      settle();
      return true;
    }

    // Optional clearance rule: the stack may declare
    // data-keep-clear="<subject>|<guard>,<guard>" so the subject never settles
    // next to one of the guards. When the flow layout brings a pair closer than
    // data-keep-gap px, the subject is parked in the open space underneath the
    // constellation, far away from both guards.
    function settle() {
      var rule = (stack.getAttribute("data-keep-clear") || "").split("|");
      if (rule.length < 2) return;
      var subject = (rule[0] || "").trim();
      var guards = (rule[1] || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
      if (!subject || !guards.length) return;
      var minGap = parseFloat(stack.getAttribute("data-keep-gap")) || 120;
      var find = function (name) {
        for (var k = 0; k < items.length; k++) {
          if ((items[k].textContent || "").trim() === name) return items[k];
        }
        return null;
      };
      var me = find(subject);
      if (!me) return;
      function box(el) {
        return {
          x: parseFloat(el.style.left) || 0,
          y: parseFloat(el.style.top) || 0,
          w: el.offsetWidth,
          h: el.offsetHeight
        };
      }
      var mine = box(me);
      var clash = guards.some(function (name) {
        var g = find(name);
        if (!g) return false;
        var r = box(g);
        var dx = Math.max(0, Math.max(mine.x, r.x) - Math.min(mine.x + mine.w, r.x + r.w));
        var dy = Math.max(0, Math.max(mine.y, r.y) - Math.min(mine.y + mine.h, r.y + r.h));
        return Math.sqrt(dx * dx + dy * dy) < minGap;
      });
      if (!clash) return;
      var floor = 0;
      items.forEach(function (el) {
        if (el === me) return;
        var r = box(el);
        floor = Math.max(floor, r.y + r.h);
      });
      var drift = stack.clientWidth < 640 ? 6 : 12;
      var top = Math.round(floor + drift + 30);
      me.style.left = Math.max(0, Math.round((stack.clientWidth - mine.w) / 2)) + "px";
      me.style.top = top + "px";
      var height = parseFloat(stack.style.height) || 0;
      var total = top + mine.h + 26;
      if (height < total) stack.style.height = Math.round(total) + "px";
    }

    function reveal() {
      if (reduceMotion) {
        items.forEach(function (el) { el.classList.add("is-in"); });
        return;
      }
      items.forEach(function (el) { el.classList.add("is-in"); });
    }

    function relayout() {
      layout();
    }

    layout();
    raf(function () { if (!stack.style.height) layout(); });
    if (doc.fonts && doc.fonts.ready) {
      doc.fonts.ready.then(function () { fontsDone = true; relayout(); });
    }
    on(window, "resize", throttle(relayout, 200));
    on(window, "load", relayout);

    if ("IntersectionObserver" in window && !reduceMotion) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            reveal();
            io.disconnect();
          }
        });
      }, { threshold: 0.06 });
      io.observe(stack);
    } else {
      reveal();
    }

    items.forEach(function (el) {
      var meta = el.getAttribute("data-meta") || "";
      var name = (el.textContent || "").trim();
      function live() {
        if (!read) return;
        read.textContent = name + " · " + meta;
        read.classList.add("is-live");
      }
      function idle() {
        if (!read) return;
        read.textContent = defaultRead;
        read.classList.remove("is-live");
      }
      on(el, "mouseenter", live);
      on(el, "focus", live);
      on(el, "mouseleave", idle);
      on(el, "blur", idle);
    });
  }

  function boot() {
    body.classList.add("site-enhanced");
    initNav();
    initReveal();
    initCounters();
    initTop();
    initProgress();
    initLightbox();
    initFilters();
    initSort();
    initSearch();
    initSmoothAnchors();
    initYearPills();
    initNameCloud();
  }

  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
