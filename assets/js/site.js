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
    var stage = $(".lb__stage", lb);
    var zoom = 1;
    var baseWidth = 0, baseHeight = 0;
    var originalWidth = imgEl.style.width, originalHeight = imgEl.style.height;
    var stageOriginal = {};
    ["tabindex", "role", "aria-label", "aria-describedby"].forEach(function (key) { stageOriginal[key] = stage.getAttribute(key); });
    var swipe = null, swipeClickUntil = 0;
    var zoomTools = doc.createElement("div");
    zoomTools.className = "lb__zoom-tools";
    var zoomIn = doc.createElement("button");
    zoomIn.className = "lb__zoom"; zoomIn.type = "button";
    zoomIn.textContent = "放大 +"; zoomIn.setAttribute("aria-label", "放大图片，最多三倍");
    var zoomReset = doc.createElement("button");
    zoomReset.className = "lb__zoom"; zoomReset.type = "button";
    zoomReset.textContent = "复位"; zoomReset.setAttribute("aria-label", "图片恢复适应屏幕");
    zoomTools.appendChild(zoomIn); zoomTools.appendChild(zoomReset);
    $(".lb__top", lb).insertBefore(zoomTools, $("[data-lb-close]", lb));
    if (!idxEl.id) idxEl.id = "lightbox-view-help";
    idxEl.setAttribute("aria-live", "polite");
    var descriptions = (lb.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean);
    if (descriptions.indexOf(idxEl.id) < 0) descriptions.push(idxEl.id);
    lb.setAttribute("aria-describedby", descriptions.join(" "));
    overlays.register(lb, "放大图片");

    function zoomButtons() {
      zoomIn.disabled = !imgEl.complete || !imgEl.naturalWidth || zoom >= 3;
      zoomReset.disabled = zoom === 1;
      zoomIn.setAttribute("aria-label", "放大图片，当前 " + Math.round(zoom * 100) + "%");
      if (list.length) idxEl.textContent = cur + 1 + " / " + list.length + (zoom > 1 ?
        " · " + Math.round(zoom * 100) + "% · 方向键平移 · 0 复位" : " · 左右键或滑动切图 · +/− 缩放");
    }
    function resetZoom() {
      zoom = 1; baseWidth = baseHeight = 0; swipe = null;
      imgEl.style.width = originalWidth; imgEl.style.height = originalHeight;
      stage.classList.remove("is-zoomed"); stage.scrollLeft = stage.scrollTop = 0;
      Object.keys(stageOriginal).forEach(function (key) {
        if (stageOriginal[key] === null) stage.removeAttribute(key);
        else stage.setAttribute(key, stageOriginal[key]);
      });
      zoomButtons();
      if (doc.activeElement === stage && overlays.isOpen(lb) && !zoomIn.disabled) zoomIn.focus({ preventScroll: true });
    }
    function changeZoom(amount) {
      if (!imgEl.complete || !imgEl.naturalWidth) return;
      if (zoom === 1) { baseWidth = imgEl.clientWidth; baseHeight = imgEl.clientHeight; }
      if (!baseWidth || !baseHeight) return;
      zoom = Math.max(1, Math.min(3, zoom + amount));
      if (zoom === 1) { resetZoom(); return; }
      stage.classList.add("is-zoomed");
      stage.setAttribute("tabindex", "0");
      stage.setAttribute("role", "region");
      stage.setAttribute("aria-label", "已放大的图片，可用方向键平移");
      stage.setAttribute("aria-describedby", idxEl.id);
      imgEl.style.width = Math.round(baseWidth * zoom) + "px";
      imgEl.style.height = Math.round(baseHeight * zoom) + "px";
      zoomButtons();
    }
    on(zoomIn, "click", function () { changeZoom(0.5); });
    on(zoomReset, "click", resetZoom);
    on(imgEl, "load", zoomButtons);
    on(imgEl, "error", zoomButtons);
    on(window, "resize", throttle(function () { if (overlays.isOpen(lb)) resetZoom(); }, 180));

    function open(items, index, trigger) {
      if (!items.length || index < 0 || overlays.isOpen(lb)) return false;
      list = items;
      cur = index;
      render();
      return overlays.open(lb, trigger, $("[data-lb-close]", lb), function () {
        resetZoom();
        imgEl.removeAttribute("src");
      });
    }
    function render() {
      var it = list[cur];
      if (!it) return;
      resetZoom();
      imgEl.src = it.full;
      zoomButtons();
      imgEl.alt = it.cap || "";
      capEl.textContent = it.cap || "";
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
      if (stage.contains(e.target) && performance.now() < swipeClickUntil) { e.preventDefault(); return; }
      if (e.target === lb || e.target.classList.contains("lb__stage")) close();
    });
    on(doc, "keydown", function (e) {
      if (!overlays.isOpen(lb)) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing || e.keyCode === 229) return;
      if (zoom > 1 && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].indexOf(e.key) >= 0) {
        e.preventDefault();
        var horizontal = Math.max(40, stage.clientWidth * 0.2);
        var vertical = Math.max(40, stage.clientHeight * 0.2);
        if (e.key === "ArrowLeft") stage.scrollLeft -= horizontal;
        if (e.key === "ArrowRight") stage.scrollLeft += horizontal;
        if (e.key === "ArrowUp") stage.scrollTop -= vertical;
        if (e.key === "ArrowDown") stage.scrollTop += vertical;
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        go(e.key === "ArrowLeft" ? -1 : 1);
      } else if (e.key === "+" || e.key === "=" || e.key === "-" || e.key === "0") {
        e.preventDefault();
        if (e.key === "0") resetZoom();
        else changeZoom(e.key === "-" ? -0.5 : 0.5);
      }
    });
    on(stage, "touchstart", function (e) {
      if (zoom !== 1 || e.touches.length !== 1) { swipe = null; return; }
      swipe = { x: e.touches[0].clientX, y: e.touches[0].clientY,
        id: e.touches[0].identifier, time: performance.now() };
    }, { passive: true });
    on(stage, "touchmove", function (e) { if (e.touches.length !== 1) swipe = null; }, { passive: true });
    on(stage, "touchend", function (e) {
      if (!swipe || zoom !== 1 || !overlays.isOpen(lb)) return;
      var start = swipe; swipe = null;
      var touch = Array.prototype.filter.call(e.changedTouches, function (item) { return item.identifier === start.id; })[0];
      if (!touch) return;
      var dx = touch.clientX - start.x, dy = touch.clientY - start.y;
      if (list.length > 1 && Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy) * 1.35 && performance.now() - start.time < 850) {
        go(dx < 0 ? 1 : -1); swipeClickUntil = performance.now() + 450;
      }
    }, { passive: true });
    on(stage, "touchcancel", function () { swipe = null; }, { passive: true });

    // Decorative icons and separators remain ordinary article content.
    var proseImgs = [];
    var articleImages = $$(".prose img").map(function (im) {
      return { el: im, active: false, original: {
        role: im.getAttribute("role"),
        tabindex: im.getAttribute("tabindex"),
        "aria-label": im.getAttribute("aria-label")
      } };
    });
    function refreshArticleImages() {
      proseImgs = articleImages.filter(function (record) {
        var im = record.el;
        var rect = im.getBoundingClientRect();
        var eligible = !!(im.currentSrc || im.getAttribute("src")) &&
          rect.width >= 44 && rect.height >= 44 && !im.closest('[aria-hidden="true"]') &&
          window.getComputedStyle(im).visibility !== "hidden";
        im.classList.toggle("js-lightbox", eligible);
        if (eligible && !record.active) {
          im.setAttribute("tabindex", "0");
          im.setAttribute("role", "button");
          im.setAttribute("aria-label", "放大图片：" + (im.alt || "文章图片"));
        } else if (!eligible && record.active) {
          Object.keys(record.original).forEach(function (key) {
            if (record.original[key] === null) im.removeAttribute(key);
            else im.setAttribute(key, record.original[key]);
          });
        }
        record.active = eligible;
        return eligible;
      }).map(function (record) { return record.el; });
    }
    articleImages.forEach(function (record) {
      on(record.el, "load", refreshArticleImages);
    });
    refreshArticleImages();
    on(window, "resize", throttle(refreshArticleImages, 180));
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
      if (t.tagName === "IMG" && t.classList.contains("js-lightbox")) {
        refreshArticleImages();
        if (!t.classList.contains("js-lightbox")) return false;
        var candidates = proseImgs.filter(function (im) { return im.classList.contains("js-lightbox"); });
        var items2 = candidates.map(function (im) {
          return { full: im.currentSrc || im.getAttribute("src"), cap: im.alt || "" };
        });
        return open(items2, candidates.indexOf(t), t);
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
      var selectedButton = null;
      $$("[data-filter]", bar).forEach(function (btn) {
        var selected = (btn.getAttribute("data-filter") || "all") === value;
        btn.classList.toggle("is-active", selected);
        btn.setAttribute("aria-pressed", selected ? "true" : "false");
        if (selected) selectedButton = btn;
      });
      // Reveal the chip only within its nearest overflowing horizontal rail.
      // scrollIntoView would also move the document's vertical position.
      for (var track = selectedButton && selectedButton.parentElement; track && bar.contains(track); track = track.parentElement) {
        var overflow = window.getComputedStyle(track).overflowX;
        if ((overflow !== "auto" && overflow !== "scroll") || !track.clientWidth || track.scrollWidth <= track.clientWidth + 1) continue;
        var bounds = track.getBoundingClientRect();
        var buttonBounds = selectedButton.getBoundingClientRect();
        var left = bounds.left + track.clientLeft + 8;
        var right = bounds.left + track.clientLeft + track.clientWidth - 8;
        if (buttonBounds.left < left) track.scrollLeft -= left - buttonBounds.left;
        else if (buttonBounds.right > right) track.scrollLeft += buttonBounds.right - right;
        break;
      }
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
    var pendingLoad = null;
    var cur = -1;
    overlays.register(modal, "站内搜索");

    function load(cb) {
      if (data) return cb();
      pendingLoad = cb;
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
              lc: [p[0], p[2], p[3], p[5]].join(" ").toLowerCase()
            };
          });
          loading = false;
          var ready = pendingLoad;
          pendingLoad = null;
          if (ready) ready();
        })
        .catch(function () {
          loading = false;
          pendingLoad = null;
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

    function renderCurrent() {
      if (overlays.isOpen(modal)) render((input.value || "").trim().toLowerCase());
    }
    function openModal(trigger) {
      if (!overlays.open(modal, trigger, input)) return;
      load(renderCurrent);
    }
    function closeModal() {
      overlays.close(modal);
    }
    function move(dir) {
      var rows = $$(".sresult", results);
      if (!rows.length) return;
      cur = cur < 0 ? (dir > 0 ? 0 : rows.length - 1) : (cur + dir + rows.length) % rows.length;
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
        load(renderCurrent);
      }, 130);
    });
    on(input, "keydown", function (e) {
      if (e.isComposing || e.keyCode === 229) return;
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
        if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        var nav = $("[data-nav]");
        var offset = (nav ? nav.getBoundingClientRect().height : 0) + 20;
        var top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top: top, behavior: reduceMotion ? "auto" : "smooth" });
        if (a.classList.contains("skip-link")) {
          target.setAttribute("tabindex", "-1");
          target.focus({ preventScroll: true });
        } else history.replaceState(history.state, "", "#" + encodeURIComponent(target.id));
      });
    });
  }

  function initYearPills() {
    $$("[data-year-link]").forEach(function (a) {
      on(a, "click", function (e) {
        if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        var y = a.getAttribute("data-year-link");
        var el = doc.getElementById("y" + y);
        if (!el) return;
        e.preventDefault();
        if (resetFilters) resetFilters();
        var nav = $("[data-nav]");
        var offset = (nav ? nav.getBoundingClientRect().height : 0) + 20;
        var top = el.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top: top, behavior: reduceMotion ? "auto" : "smooth" });
        history.replaceState(history.state, "", "#" + encodeURIComponent(el.id));
      });
    });
  }

  /* ------------------------------------------------------- name cloud */
  function initNameCloud() {
    var box = $("[data-namecloud]");
    if (!box) return;
    var stack = $("[data-name-stack]", box);
    var read = $("[data-name-read]", box);
    var source = $("[data-name-source]", box);
    var hint = $("[data-name-hint]", box);
    if (!stack) return;
    var items = $$(".nw", stack);
    if (!items.length) return;
    var touch = window.matchMedia("(hover: none), (pointer: coarse)");
    var selected = null;
    var frame = 0;
    var signature = "";
    var lastWidth = 0;
    function walkerName(el) {
      return (el.textContent || "").replace(/\s+/g, "");
    }
    // Link boxes include their touch area and the text's small motion envelope.
    // Plain flow in DOM order: keyboard traversal and the visual reading order
    // agree, and no name gets a bespoke slot.
    function place(measured, width) {
      var narrow = width < 640;
      var rowGap = narrow ? 9 : 17;
      var gaps = narrow ? [10, 16, 8, 13] : [25, 42, 20, 34];
      var indents = narrow ? [0, 8, 2, 12] : [0, 32, 10, 44];
      var cells = [];
      var x = 0, y = 4, bottom = 4, row = 0;

      function nextRow(item) {
        row++;
        y = bottom + rowGap;
        x = Math.min(indents[row % indents.length], Math.max(0, width - item.w));
      }
      measured.forEach(function (item, i) {
        if (x + item.w > width) nextRow(item);
        var cell = { el: item.el, name: item.name, w: item.w, h: item.h,
          x: x, y: y + (narrow ? 0 : (i * 3) % 7) };
        cells.push(cell);
        bottom = Math.max(bottom, cell.y + cell.h);
        x = cell.x + cell.w + gaps[i % gaps.length];
      });
      return { cells: cells, height: Math.ceil(bottom + 12) };
    }

    function layout() {
      frame = 0;
      var width = stack.clientWidth;
      if (!width) return;
      stack.classList.add("is-cloud");
      // Batch all reads, then all writes. Font changes alter this fingerprint;
      // positioning and hover never do, so observer callbacks cannot loop.
      var measured = items.map(function (el) {
        return { el: el, name: walkerName(el), w: el.offsetWidth, h: el.offsetHeight };
      });
      if (measured.some(function (item) { return !item.w || !item.h; })) {
        stack.classList.remove("is-cloud");
        stack.style.height = "";
        return;
      }
      var nextSignature = width + "|" + measured.map(function (item) { return item.w + "x" + item.h; }).join("|");
      if (nextSignature === signature) return;
      signature = nextSignature;
      lastWidth = width;
      var result = place(measured, width);
      result.cells.forEach(function (cell) {
        cell.el.style.left = cell.x + "px";
        cell.el.style.top = cell.y + "px";
      });
      stack.style.height = result.height + "px";
    }
    function schedule() {
      if (!frame) frame = raf(layout);
    }
    function show(el) {
      if (selected) selected.classList.remove("is-current");
      selected = el;
      el.classList.add("is-current");
      var name = walkerName(el);
      if (read) {
        read.textContent = name + " · " + (el.getAttribute("data-meta") || "");
        read.classList.add("is-live");
      }
      if (source) {
        source.href = el.getAttribute("href");
        source.setAttribute("aria-label", "阅读" + name + "的相关推文");
        source.hidden = false;
      }
    }
    function instructions() {
      if (hint) hint.textContent = touch.matches ?
        "点名字查看参与记录，再点「阅读相关推文」。" :
        "移入或聚焦名字，查看参与记录；点击名字阅读推文。";
    }

    box.classList.add("is-interactive");

    // Arrival: the names surface one after another, like a constellation
    // slowly gathering. Positions are written already, so the reveal never
    // shifts a comfortable hit area.
    var revealTimer = 0;
    function revealWalkers() {
      window.clearTimeout(revealTimer);
      items.forEach(function (el, i) {
        el.style.setProperty("--nc-reveal", Math.min(900, i * 16) + "ms");
        el.classList.add("is-in");
      });
      revealTimer = window.setTimeout(function () {
        stack.classList.add("is-settled");
        items.forEach(function (el) { el.style.setProperty("--nc-reveal", "0ms"); });
      }, 2600);
    }

    items.forEach(function (el) {
      on(el, "mouseenter", function () { if (!touch.matches) show(el); });
      on(el, "focus", function () { show(el); });
      on(el, "click", function (e) {
        // Preserve normal keyboard activation and modified/open-in-new-tab clicks.
        if (touch.matches && e.detail > 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
          e.preventDefault();
          show(el);
        }
      });
    });
    instructions();
    if (touch.addEventListener) on(touch, "change", instructions);
    else if (touch.addListener) touch.addListener(instructions);
    layout();
    on(window, "resize", schedule);
    if (window.ResizeObserver) {
      new ResizeObserver(function (entries) {
        if (Math.abs(entries[0].contentRect.width - lastWidth) > 0.5) schedule();
      }).observe(stack);
    }
    if (doc.fonts) {
      doc.fonts.ready.then(schedule);
      on(doc.fonts, "loadingdone", schedule);
    }
    if (reduceMotion || !("IntersectionObserver" in window)) {
      revealWalkers();
    } else {
      var revealObserver = new IntersectionObserver(function (entries) {
        for (var r = 0; r < entries.length; r++) {
          if (entries[r].isIntersecting) {
            revealObserver.disconnect();
            revealWalkers();
            return;
          }
        }
      }, { threshold: 0.06, rootMargin: "0px 0px -6% 0px" });
      revealObserver.observe(stack);
    }

    // Ambient float rides a CSS keyframe animation on each glyph, so the
    // compositor keeps the 89 names drifting without a script frame loop. The
    // pointer ripple is the only scripted motion: it nudges a glyph through the
    // `translate` property (independent of the animated `transform`) and the
    // loop shuts itself down once the rings have decayed.
    if (!reduceMotion) {
      items.forEach(function (el, i) {
        var glyph = el.querySelector(".nw__t");
        if (!glyph) return;
        var tempo = 7 + Math.random() * 6;
        // Four paths at three amplitudes: plain pixel keyframes, so every
        // animation stays on the compositor and never stalls on a keyframe.
        var path = ["A", "B", "C"][Math.floor(Math.random() * 3)];
        glyph.style.animationName = "nwFloat" + (1 + i % 4) + path;
        glyph.style.animationDuration = tempo.toFixed(2) + "s";
        glyph.style.animationDelay = (-Math.random() * tempo).toFixed(2) + "s";
        glyph.style.animationTimingFunction = "linear";
        glyph.style.animationIterationCount = "infinite";
        glyph.style.animationDirection = "alternate";
      });

      if ("IntersectionObserver" in window) {
        new IntersectionObserver(function (entries) {
          stack.classList.toggle("is-motile", !!entries[0].isIntersecting);
        }, { threshold: 0 }).observe(stack);
      } else {
        stack.classList.add("is-motile");
      }

      if (!touch.matches && "translate" in doc.body.style) {
        var glyphs = items.map(function (el) { return el.querySelector(".nw__t"); });
        var centres = items.map(function () { return { cx: 0, cy: 0 }; });
        var seeds = [];
        var rippleFrame = 0;
        var lastSeed = 0;

        var measure = function () {
          for (var i = 0; i < items.length; i++) {
            centres[i].cx = items[i].offsetLeft + items[i].offsetWidth / 2;
            centres[i].cy = items[i].offsetTop + items[i].offsetHeight / 2;
          }
        };
        measure();

        var offsetAt = function (cx, cy, now) {
          var tx = 0;
          var ty = 0;
          for (var r = 0; r < seeds.length; r++) {
            var seed = seeds[r];
            var age = (now - seed.t0) / 1000;
            if (age < 0 || age > 1.5) continue;
            var rx = cx - seed.x;
            var ry = cy - seed.y;
            var dist = Math.sqrt(rx * rx + ry * ry) || 1;
            var ring = dist - 540 * age;
            var reach = Math.exp(-dist / 560);
            var fade = age > 0.45 ? 1 - (age - 0.45) / 1.05 : 1;
            var bump = Math.exp(-ring * ring / 15000) * 22;
            var tail = Math.sin(ring / 120) * Math.exp(-Math.abs(ring) / 220) * 7;
            var wave = (bump + tail) * reach * fade;
            tx += wave * (rx / dist);
            ty += wave * (ry / dist);
          }
          return { x: tx, y: ty };
        };

        var rippleStep = function (now) {
          if (seeds.length && now - seeds[0].t0 > 1500) {
            seeds = seeds.filter(function (seed) { return now - seed.t0 <= 1500; });
          }
          for (var i = 0; i < items.length; i++) {
            var glyph = glyphs[i];
            if (!glyph) continue;
            var off = seeds.length ? offsetAt(centres[i].cx, centres[i].cy, now) : null;
            if (off && (Math.abs(off.x) > 0.06 || Math.abs(off.y) > 0.06)) {
              glyph.style.translate = off.x.toFixed(1) + "px " + off.y.toFixed(1) + "px";
            } else if (glyph.style.translate) {
              glyph.style.translate = "";
            }
          }
          rippleFrame = seeds.length ? raf(rippleStep) : 0;
        };

        var seed = function (clientX, clientY) {
          var box = stack.getBoundingClientRect();
          seeds.push({ x: clientX - box.left, y: clientY - box.top, t0: performance.now() });
          if (seeds.length > 4) seeds.shift();
          if (!rippleFrame) rippleFrame = raf(rippleStep);
        };

        on(stack, "pointermove", function (e) {
          if (e.pointerType && e.pointerType !== "mouse") return;
          var now = performance.now();
          if (now - lastSeed < 50) return;
          lastSeed = now;
          seed(e.clientX, e.clientY);
        });
        on(window, "resize", function () { window.setTimeout(measure, 300); });
        if (doc.fonts) doc.fonts.ready.then(measure);
      }
    }
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
