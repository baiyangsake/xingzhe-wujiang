/* 行者无疆 · site interactions
   vanilla, no dependencies. everything is progressive enhancement. */
(function () {
  "use strict";

  var doc = document;
  var body = doc.body;
  var BASE = body ? body.getAttribute("data-base") || "" : "";
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
    function setDrawer(open) {
      if (!drawer) return;
      drawer.classList.toggle("is-open", open);
      drawer.setAttribute("aria-hidden", open ? "false" : "true");
      body.classList.toggle("is-locked", open);
      if (burger) burger.setAttribute("aria-expanded", open ? "true" : "false");
    }
    on(burger, "click", function () {
      setDrawer(true);
    });
    on(closeBtn, "click", function () {
      setDrawer(false);
    });
    $$("[data-drawer] a").forEach(function (a) {
      on(a, "click", function () {
        setDrawer(false);
      });
    });

    // mark current nav item
    var path = location.pathname.split("/").pop() || "index.html";
    $$(".nav__links a, .drawer__links a").forEach(function (a) {
      var href = (a.getAttribute("href") || "").split("/").pop();
      if (href === path) a.classList.add("is-active");
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

    function open(items, index) {
      list = items;
      cur = index;
      render();
      lb.classList.add("is-open");
      lb.setAttribute("aria-hidden", "false");
      body.classList.add("is-locked");
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
      lb.classList.remove("is-open");
      lb.setAttribute("aria-hidden", "true");
      body.classList.remove("is-locked");
      imgEl.src = "";
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
      if (!lb.classList.contains("is-open")) return;
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    });

    // collect article images
    var proseImgs = $$(".prose img").filter(function (im) {
      return im.getAttribute("src");
    });
    proseImgs.forEach(function (im) {
      im.classList.add("js-lightbox");
    });
    document.addEventListener("click", function (e) {
      var t = e.target;
      if (!t || t.nodeType !== 1) return;
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
        open(items, figures.indexOf(figure));
        return;
      }
      if (t.classList.contains("js-lightbox") || (t.tagName === "IMG" && t.parentNode && t.parentNode.closest && t.parentNode.closest(".prose"))) {
        if (!t.classList.contains("js-lightbox") && t.tagName === "IMG") t.classList.add("js-lightbox");
        var items2 = proseImgs.map(function (im) {
          return { full: im.getAttribute("src"), cap: im.alt || "" };
        });
        open(items2, proseImgs.indexOf(t));
      }
    });
  }

  /* ------------------------------------------------------------ filters (archive / chronicle / gallery) */
  function initFilters() {
    var bars = $$("[data-filterbar]");
    if (!bars.length) return;
    var items = $$("[data-filter-item]");
    var searches = $$("[data-filter-search]");
    var state = { q: "" };
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
      if (state.q && (el.getAttribute("data-text") || "").indexOf(state.q) < 0) return false;
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

    bars.forEach(function (bar) {
      var g = bar.getAttribute("data-filterbar") || "series";
      $$("[data-filter]", bar).forEach(function (btn) {
        on(btn, "click", function () {
          $$("[data-filter]", bar).forEach(function (b) {
            b.classList.remove("is-active");
            b.setAttribute("aria-pressed", "false");
          });
          btn.classList.add("is-active");
          btn.setAttribute("aria-pressed", "true");
          state[g] = btn.getAttribute("data-filter") || "all";
          apply();
        });
      });
    });

    if (searches.length) {
      var timer = null;
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

    apply();
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

    function openModal() {
      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
      body.classList.add("is-locked");
      load(function () {
        render((input.value || "").trim().toLowerCase());
        setTimeout(function () {
          input.focus();
        }, 60);
      });
    }
    function closeModal() {
      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
      body.classList.remove("is-locked");
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
        openModal();
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
      var typing = tag === "INPUT" || tag === "TEXTAREA";
      if ((e.key === "/" && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        openModal();
      }
      if (e.key === "Escape" && modal.classList.contains("is-open")) closeModal();
    });
  }

  /* ------------------------------------------------------------ misc */
  function initSmoothAnchors() {
    $$('a[href^="#"]').forEach(function (a) {
      var id = a.getAttribute("href");
      if (!id || id === "#" || id.length < 2) return;
      var target = doc.getElementById(id.slice(1));
      if (!target) return;
      on(a, "click", function (e) {
        e.preventDefault();
        var top = target.getBoundingClientRect().top + window.scrollY - 90;
        window.scrollTo({ top: top, behavior: reduceMotion ? "auto" : "smooth" });
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
        var chips = $$("[data-filter]", $("[data-filterbar]") || doc);
        chips.forEach(function (b) {
          b.classList.remove("is-active");
        });
        var any = $('[data-filter="all"]');
        if (any) any.classList.add("is-active");
        $$("[data-filter-item]").forEach(function (i) {
          i.classList.remove("is-hidden");
        });
        var c = $("[data-filter-count]");
        if (c) c.textContent = $$("[data-filter-item]").length;
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
      return true;
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
