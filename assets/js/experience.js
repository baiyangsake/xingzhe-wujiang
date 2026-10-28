/* site.js */
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
    var motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    var glyphs = items.map(function (el) { return el.querySelector(".nw__t"); });
    var centres = items.map(function () { return { cx: 0, cy: 0 }; });
    var offsets = items.map(function () { return { x: 0, y: 0, vx: 0, vy: 0, value: "" }; });
    var pointer = { active: false, x: 0, y: 0 };
    var pointerFrame = 0, lastStep = 0;
    var inView = false, scrolling = false, touching = false, motionOn = false;
    var scrollTimer = 0;
    var boundsDirty = true, documentLeft = 0, documentTop = 0;
    var revealed = false;
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
      stopPointer(true);
      result.cells.forEach(function (cell, i) {
        cell.el.style.left = cell.x + "px";
        cell.el.style.top = cell.y + "px";
        centres[i].cx = cell.x + cell.w / 2;
        centres[i].cy = cell.y + cell.h / 2;
      });
      stack.style.height = result.height + "px";
      boundsDirty = true;
    }
    function schedule() {
      boundsDirty = true;
      if (!frame) frame = raf(layout);
    }
    function show(el) {
      if (selected === el) return;
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
      // A wrapped record can move the wall on narrow desktop windows.
      boundsDirty = true;
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
      if (revealed) return;
      revealed = true;
      if (revealObserver) revealObserver.disconnect();
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
    function pointerPreference() { instructions(); updateGate(); }
    if (touch.addEventListener) on(touch, "change", pointerPreference);
    else if (touch.addListener) touch.addListener(pointerPreference);
    layout();
    on(window, "resize", function () { schedule(); pauseForScroll(); }, { passive: true });
    if (window.ResizeObserver) {
      new ResizeObserver(function (entries) {
        if (Math.abs(entries[0].contentRect.width - lastWidth) > 0.5) schedule();
      }).observe(stack);
    }
    if (doc.fonts) {
      doc.fonts.ready.then(schedule);
      on(doc.fonts, "loadingdone", schedule);
    }
    if (motionPreference.matches || !("IntersectionObserver" in window)) {
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

    // Install each CSS path once. Pausing the wall never rebuilds its timeline.
    glyphs.forEach(function (glyph, i) {
      if (!glyph) return;
      var tempo = (7 + Math.random() * 6).toFixed(2) + "s";
      var path = ["A", "B", "C"][Math.floor(Math.random() * 3)];
      glyph.style.animationName = "nwFloat" + (1 + i % 4) + path;
      glyph.style.animationDuration = tempo;
      glyph.style.setProperty("--nc-tempo", tempo);
      glyph.style.animationDelay = (-Math.random() * parseFloat(tempo)).toFixed(2) + "s";
      glyph.style.animationTimingFunction = "linear";
      glyph.style.animationIterationCount = "infinite";
      glyph.style.animationDirection = "alternate";
    });

    // Mouse events only replace the latest target. A single display-synced
    // spring owns the displacement; no live wave is discarded mid-motion.
    function stopPointer(reset) {
      if (pointerFrame) window.cancelAnimationFrame(pointerFrame);
      pointerFrame = 0;
      lastStep = 0;
      pointer.active = false;
      if (!reset) return;
      offsets.forEach(function (offset, i) {
        if (offset.value && glyphs[i]) glyphs[i].style.translate = "";
        offset.x = offset.y = offset.vx = offset.vy = 0;
        offset.value = "";
      });
    }
    function canFollowPointer() {
      return motionOn && !touch.matches && "translate" in doc.body.style;
    }
    function requestPointerFrame() {
      if (canFollowPointer() && !pointerFrame) pointerFrame = raf(pointerStep);
    }
    function updateGate() {
      var active = inView && !scrolling && !touching && !doc.hidden && !motionPreference.matches;
      if (active !== motionOn) {
        motionOn = active;
        stack.classList.toggle("is-motile", active);
      }
      if (!canFollowPointer()) {
        // Freeze during scroll; removing an offset here would visibly snap it
        // back. Offscreen, hidden and accessibility changes can reset safely.
        stopPointer(!inView || doc.hidden || motionPreference.matches || touch.matches);
      } else if (offsets.some(function (offset) { return offset.x || offset.y || offset.vx || offset.vy; })) {
        requestPointerFrame();
      }
    }
    function refreshBounds() {
      var rect = stack.getBoundingClientRect();
      documentLeft = rect.left + (window.scrollX || 0);
      documentTop = rect.top + (window.scrollY || 0);
      boundsDirty = false;
      return rect;
    }
    function measureVisibility() {
      var rect = refreshBounds();
      inView = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight &&
        rect.right > 0 && rect.left < window.innerWidth;
      updateGate();
    }
    function pauseForScroll() {
      scrolling = true;
      boundsDirty = true;
      window.clearTimeout(scrollTimer);
      updateGate();
      scrollTimer = window.setTimeout(function () {
        scrollTimer = 0;
        if (touching) return;
        scrolling = false;
        if (!("IntersectionObserver" in window)) measureVisibility();
        else {
          updateGate();
          if (canFollowPointer() && boundsDirty) refreshBounds();
        }
      }, 180);
    }

    function pointerStep(now) {
      pointerFrame = 0;
      if (!canFollowPointer()) { stopPointer(false); return; }
      if (boundsDirty) refreshBounds();
      var x = pointer.x + (window.scrollX || 0) - documentLeft;
      var y = pointer.y + (window.scrollY || 0) - documentTop;
      var dt = lastStep ? Math.min(0.032, Math.max(0, (now - lastStep) / 1000)) : 1 / 60;
      lastStep = now;
      var omega = 22, decay = Math.exp(-omega * dt), moving = false;
      for (var i = 0; i < glyphs.length; i++) {
        if (!glyphs[i]) continue;
        var offset = offsets[i], tx = 0, ty = 0;
        if (pointer.active) {
          var dx = centres[i].cx - x, dy = centres[i].cy - y;
          var falloff = Math.max(0, 1 - (dx * dx + dy * dy) / 40000);
          var force = 0.14 * falloff * falloff;
          tx = dx * force;
          ty = dy * force;
        }
        // Exact critically damped solution: both position and velocity carry
        // across every new target, including abrupt reversals and pointerleave.
        var ex = offset.x - tx, ey = offset.y - ty;
        var sx = (offset.vx + omega * ex) * dt;
        var sy = (offset.vy + omega * ey) * dt;
        offset.x = tx + (ex + sx) * decay;
        offset.y = ty + (ey + sy) * decay;
        offset.vx = (offset.vx - omega * sx) * decay;
        offset.vy = (offset.vy - omega * sy) * decay;
        var unsettled = Math.abs(offset.x - tx) > 0.005 || Math.abs(offset.y - ty) > 0.005 ||
          Math.abs(offset.vx) > 0.05 || Math.abs(offset.vy) > 0.05;
        if (unsettled) moving = true;
        else { offset.x = tx; offset.y = ty; offset.vx = offset.vy = 0; }
        var value = Math.abs(offset.x) > 0.005 || Math.abs(offset.y) > 0.005 ?
          offset.x.toFixed(2) + "px " + offset.y.toFixed(2) + "px" : "";
        if (value !== offset.value) {
          glyphs[i].style.translate = value;
          offset.value = value;
        }
      }
      if (moving) requestPointerFrame();
      else lastStep = 0;
    }
    on(stack, "pointermove", function (event) {
      if (!canFollowPointer() || (event.pointerType && event.pointerType !== "mouse")) return;
      if (pointer.active && pointer.x === event.clientX && pointer.y === event.clientY) return;
      pointer.active = true;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      requestPointerFrame();
    }, { passive: true });
    on(stack, "pointerleave", function () { pointer.active = false; requestPointerFrame(); });
    on(stack, "pointercancel", function () { pointer.active = false; requestPointerFrame(); });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        inView = !!entries[0].isIntersecting;
        updateGate();
      }, { threshold: 0 }).observe(stack);
    } else measureVisibility();
    on(window, "scroll", pauseForScroll, { passive: true });
    on(window, "wheel", pauseForScroll, { passive: true });
    on(window, "touchstart", function () { touching = true; pauseForScroll(); }, { passive: true });
    on(window, "touchmove", pauseForScroll, { passive: true });
    function touchEnd(event) { touching = !!event.touches.length; pauseForScroll(); }
    on(window, "touchend", touchEnd, { passive: true });
    on(window, "touchcancel", touchEnd, { passive: true });
    function preferenceChanged() {
      if (motionPreference.matches) revealWalkers();
      updateGate();
    }
    if (motionPreference.addEventListener) on(motionPreference, "change", preferenceChanged);
    else if (motionPreference.addListener) motionPreference.addListener(preferenceChanged);
    on(doc, "visibilitychange", function () {
      window.clearTimeout(scrollTimer); scrollTimer = 0;
      scrolling = touching = false;
      if (doc.hidden) { boundsDirty = true; updateGate(); }
      else measureVisibility();
    });
    on(window, "pagehide", function () {
      window.clearTimeout(scrollTimer); scrollTimer = 0;
      inView = scrolling = touching = false;
      boundsDirty = true;
      updateGate();
    });
    on(window, "pageshow", function () {
      window.clearTimeout(scrollTimer); scrollTimer = 0;
      scrolling = touching = false;
      measureVisibility();
    });
    updateGate();
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
;
/* field-design.js */
/* Small, native enhancements. The photographs and stories remain usable without JS. */
(function () {
  'use strict';
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var dataNode = document.getElementById('field-expeditions');
  if (dataNode) {
    var journeys = JSON.parse(dataNode.textContent);
    var buttons = Array.from(document.querySelectorAll('[data-expedition]'));
    var image = document.querySelector('[data-exp-image]');
    var detail = document.getElementById('expedition-detail');
    var archiveLink = document.querySelector('[data-exp-archive]');
    var sequence = 0;
    var loadedImages = Object.create(null);
    var imageStatus = document.createElement('p');
    imageStatus.className = 'exp-detail__status';
    imageStatus.hidden = true;
    imageStatus.setAttribute('role', 'status');
    detail.appendChild(imageStatus);
    function prepareImage(url) {
      if (!loadedImages[url]) {
        loadedImages[url] = new Promise(function (resolve, reject) {
          var nextImage = new Image();
          nextImage.onload = function () {
            if (nextImage.decode) nextImage.decode().then(resolve, resolve);
            else resolve();
          };
          nextImage.onerror = reject;
          nextImage.src = url;
        }).catch(function (error) { delete loadedImages[url]; throw error; });
      }
      return loadedImages[url];
    }
    function updateArchive(journey) {
      if (!archiveLink) return;
      archiveLink.href = 'archive.html?series=' + encodeURIComponent(journey.id);
      archiveLink.textContent = '阅读本期 ' + journey.count + ' 篇记录 ↗';
    }
    updateArchive(journeys[0]);
    function select(index, moveFocus) {
      var journey = journeys[index];
      if (!journey) return;
      buttons.forEach(function (button, i) {
        button.classList.toggle('is-selected', i === index);
        button.setAttribute('aria-pressed', String(i === index));
      });
      document.querySelector('[data-exp-no]').textContent = String(journey.number).padStart(2, '0');
      document.querySelector('[data-exp-season]').textContent = journey.season + ' / ' + journey.route;
      document.querySelector('[data-exp-name]').textContent = journey.name;
      document.querySelector('[data-exp-lead]').textContent = journey.lead;
      document.querySelectorAll('[data-exp-link]').forEach(function (a) { a.href = journey.url; });
      updateArchive(journey);
      var request = ++sequence;
      detail.classList.add('is-loading');
      detail.classList.remove('has-image-error');
      detail.setAttribute('aria-busy', 'true');
      imageStatus.hidden = true;
      prepareImage(journey.image).then(function () {
        if (request !== sequence) return;
        image.alt = journey.caption;
        image.src = journey.image;
        detail.classList.remove('is-loading');
        detail.removeAttribute('aria-busy');
      }, function () {
        if (request !== sequence) return;
        detail.classList.remove('is-loading');
        detail.classList.add('has-image-error');
        detail.removeAttribute('aria-busy');
        imageStatus.textContent = '现场图片暂未加载，仍可打开本期实践与全部记录。';
        imageStatus.hidden = false;
      });
      if (moveFocus) {
        buttons[index].focus({preventScroll: true});
        buttons[index].scrollIntoView({block:'nearest', inline:'nearest', behavior:reduced ? 'auto' : 'smooth'});
      }
    }
    buttons.forEach(function (button, index) {
      function warmImage() { prepareImage(journeys[index].image).catch(function () {}); }
      button.addEventListener('pointerenter', warmImage, {once:true});
      button.addEventListener('focus', warmImage, {once:true});
      button.addEventListener('click', function () { select(index, false); });
      button.addEventListener('keydown', function (event) {
        var next = index;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % buttons.length;
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index + buttons.length - 1) % buttons.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = buttons.length - 1;
        else return;
        event.preventDefault(); select(next, true);
      });
    });
  }

  var progress = document.createElement('div');
  progress.className = 'field-page-progress';
  progress.setAttribute('aria-hidden', 'true');
  document.body.appendChild(progress);
  var frame = 0;
  var sectionRail = document.querySelector('[data-section-rail]');
  var sectionLinks = sectionRail ? Array.from(sectionRail.querySelectorAll('a')) : [];
  var sectionTargets = sectionLinks.map(function (link) { return document.querySelector(link.getAttribute('href')); });
  function updateProgress() {
    frame = 0;
    var distance = document.documentElement.scrollHeight - window.innerHeight;
    var fraction = distance > 0 ? window.scrollY / distance : 0;
    progress.style.transform = 'scaleX(' + Math.max(0, Math.min(1, fraction)) + ')';
    if (sectionLinks.length) {
      var current = 0;
      sectionTargets.forEach(function (section, index) {
        if (section && section.getBoundingClientRect().top <= Math.min(220, window.innerHeight * .28)) current = index;
      });
      sectionLinks.forEach(function (link, index) {
        if (index === current) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }
  }
  function requestUpdate() { if (!frame) frame = requestAnimationFrame(updateProgress); }
  window.addEventListener('scroll', requestUpdate, {passive:true});
  window.addEventListener('resize', requestUpdate);
  window.addEventListener('load', requestUpdate, {once:true});
  updateProgress();

  if (!reduced && 'IntersectionObserver' in window && document.querySelector('.field-main')) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('field-in');
          observer.unobserve(entry.target);
        }
      });
    }, {threshold:.08, rootMargin:'0px 0px -24px 0px'});
    document.querySelectorAll('.field-manifesto h2,.field-atlas__heading,.field-images__heading,.field-story').forEach(function (el) {
      if (el.hasAttribute('data-motion') || el.closest('[data-motion]')) return;
      el.setAttribute('data-field-reveal', ''); observer.observe(el);
    });
    document.body.classList.add('field-motion');
  }
  var cover = document.querySelector('[data-cover-visual]');
  if (cover && !reduced && window.matchMedia('(hover:hover) and (pointer:fine)').matches) {
    cover.addEventListener('pointermove', function (event) {
      var bounds = cover.getBoundingClientRect();
      cover.style.setProperty('--cover-x', ((event.clientX - bounds.left) / bounds.width - .5) * 7 + 'px');
      cover.style.setProperty('--cover-y', ((event.clientY - bounds.top) / bounds.height - .5) * 5 + 'px');
    }, {passive:true});
    cover.addEventListener('pointerleave', function () {
      cover.style.setProperty('--cover-x', '0px'); cover.style.setProperty('--cover-y', '0px');
    });
  }
})();
;
/* motion-system.js */
/* Shared, optional motion. All links, images and native scrolling work without it. */
(function () {
  "use strict";
  if (window.__walkersMotion) return;
  window.__walkersMotion = true;
  var doc = document;
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  var fine = window.matchMedia("(hover: hover) and (pointer: fine)");
  function all(selector, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(selector)); }
  function on(el, type, fn, options) { if (el) el.addEventListener(type, fn, options || false); }
  function change(media, fn) { if (media.addEventListener) on(media, "change", fn); else if (media.addListener) media.addListener(fn); }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function enabled() { return fine.matches && !reduced.matches && !doc.hidden; }

  function boot() {
    var animations = new Map();
    var seen = new WeakSet();
    var observer = null;
    var records = [];
    var moving = new Set();
    var frame = 0;
    var cursor = null;
    var cursorTarget = null;
    var cursorDirty = false;
    var cursorX = 0, cursorY = 0, cursorWidth = 0, cursorHeight = 0;
    var rails = [];

    function stopReveal(el) {
      var animation = animations.get(el);
      if (animation) animation.cancel();
      animations.delete(el);
      el.classList.remove("motion-is-revealing");
      el.classList.remove("motion-pending");
      el.classList.add("motion-done");
      if (observer) observer.unobserve(el);
    }
    function reveal(el) {
      if (seen.has(el)) return;
      seen.add(el);
      if (reduced.matches || doc.hidden || !el.animate) {
        if (observer) observer.unobserve(el);
        el.classList.remove("motion-pending");
        el.classList.add("motion-done");
        return;
      }
      var type = el.getAttribute("data-motion") ||
        (el.hasAttribute("data-text-reveal") ? "text" : el.hasAttribute("data-image-reveal") || el.matches(".masonry figure, .prow__media") ? "image" : "fade");
      var from = type === "text" ? { clipPath: "inset(100% 0 0 0)", opacity: 0.25 } :
        type === "image" ? { clipPath: "inset(0 0 100% 0)", opacity: 0.65 } : { opacity: 0 };
      var to = type === "fade" ? { opacity: 1 } : { clipPath: "inset(0 0 0 0)", opacity: 1 };
      var duration = type === "image" ? 950 : type === "text" ? 800 : 560;
      var delay = clamp(parseFloat(el.getAttribute("data-motion-delay")) || 0, 0, 400);
      el.classList.add("motion-is-revealing");
      var animation = el.animate([from, to], { duration: duration, delay: delay, easing: "cubic-bezier(.22,.78,.2,1)", fill: "both" });
      animations.set(el, animation);
      animation.finished.then(function () { stopReveal(el); }, function () {
        animations.delete(el); el.classList.remove("motion-is-revealing");
        el.classList.remove("motion-pending"); el.classList.add("motion-done");
      });
    }
    // Existing reveal systems retain ownership of their own elements and trees.
    var revealItems = all("[data-motion], [data-text-reveal], [data-image-reveal], .prow__media, .masonry figure, .entry").filter(function (el) {
      return !el.closest(".prose, [data-reveal], [data-field-reveal]") &&
        !el.querySelector("[data-reveal], [data-field-reveal]") && !el.closest("[aria-hidden='true']");
    });
    var revealSet = new WeakSet(revealItems);
    // Arm the hidden state only where a reveal can actually run, so the page
    // never renders blank content for a browser that cannot animate it.
    var canReveal = !reduced.matches && "IntersectionObserver" in window && !!window.Element.prototype.animate;
    if (canReveal) {
      revealItems.forEach(function (el) { el.classList.add("motion-pending"); });
    }
    on(doc, "focusin", function (event) {
      for (var el = event.target; el && el !== doc.body; el = el.parentElement) {
        if (revealSet.has(el)) { seen.add(el); stopReveal(el); }
      }
    });
    if ("IntersectionObserver" in window) {
      try {
        observer = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) reveal(entry.target);
          });
        }, { threshold: 0.08, rootMargin: "0px 0px -4% 0px" });
        revealItems.forEach(function (el) { observer.observe(el); });
      } catch (error) {
        // A motion failure must never leave content hidden.
        revealItems.forEach(function (el) {
          el.classList.remove("motion-pending");
          el.classList.add("motion-done");
        });
      }
    }

    function resetRecord(record) {
      record.x = record.y = record.tx = record.ty = 0;
      record.active = false;
      record.el.classList.remove("motion-pointer-active");
      if (record.magnetic) record.magnetic.style.translate = record.translate;
      if (record.tilt) record.tilt.style.rotate = record.rotate;
      moving.delete(record);
    }
    function hideCursor() {
      if (cursor) cursor.classList.remove("is-active");
      cursorTarget = null;
      cursorDirty = false;
    }
    function request() { if (!frame && enabled()) frame = requestAnimationFrame(tick); }
    function tick() {
      frame = 0;
      if (!enabled()) { resetMotion(); return; }
      var again = false;
      moving.forEach(function (record) {
        if (!record.visible) { resetRecord(record); return; }
        record.x += (record.tx - record.x) * 0.2;
        record.y += (record.ty - record.y) * 0.2;
        var settled = Math.abs(record.tx - record.x) + Math.abs(record.ty - record.y) < 0.004;
        if (settled) { record.x = record.tx; record.y = record.ty; }
        if (record.magnetic) record.magnetic.style.translate =
          (record.x * record.strength).toFixed(2) + "px " + (record.y * record.strength).toFixed(2) + "px";
        if (record.tilt) {
          var nx = record.x / Math.max(1, record.bounds.width / 2);
          var ny = record.y / Math.max(1, record.bounds.height / 2);
          var angle = Math.sqrt(nx * nx + ny * ny) * record.degrees;
          record.tilt.style.rotate = angle < 0.001 ? "0deg" : (-ny).toFixed(4) + " " + nx.toFixed(4) + " 0 " + angle.toFixed(3) + "deg";
        }
        if (settled) {
          moving.delete(record);
          if (!record.active) resetRecord(record);
        } else again = true;
      });
      if (cursorDirty && cursorTarget && cursor) {
        var left = clamp(cursorX + 18, 8, Math.max(8, innerWidth - cursorWidth - 8));
        var top = cursorY + 18 + cursorHeight > innerHeight ? cursorY - cursorHeight - 16 : cursorY + 18;
        cursor.style.transform = "translate3d(" + left + "px," + clamp(top, 8, Math.max(8, innerHeight - cursorHeight - 8)) + "px,0)";
        cursorDirty = false;
      }
      if (again) request();
    }
    function resetMotion() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      records.forEach(resetRecord);
      hideCursor();
    }
    function point(record, event) {
      if (!enabled() || event.pointerType !== "mouse" || !record.visible) return;
      if (event.buttons) { resetRecord(record); return; }
      if (!record.active) {
        record.bounds = record.el.getBoundingClientRect();
        record.active = true;
        record.el.classList.add("motion-pointer-active");
      }
      record.tx = clamp(event.clientX - record.bounds.left - record.bounds.width / 2, -70, 70);
      record.ty = clamp(event.clientY - record.bounds.top - record.bounds.height / 2, -70, 70);
      moving.add(record);
      request();
    }
    all("[data-magnetic], [data-tilt]").filter(function (el) { return !el.closest(".prose"); }).forEach(function (el) {
      var magnetic = el.hasAttribute("data-magnetic") ? el.querySelector("[data-magnetic-inner]") || el.firstElementChild : null;
      var tilt = el.hasAttribute("data-tilt") ? el.querySelector("[data-tilt-inner]") || el.firstElementChild : null;
      // A plain text-only link stays still rather than moving its own hit area.
      if (!magnetic && !tilt) return;
      var record = { el: el, magnetic: magnetic, tilt: tilt, translate: magnetic ? magnetic.style.translate : "",
        rotate: tilt ? tilt.style.rotate : "", x: 0, y: 0, tx: 0, ty: 0, active: false, visible: true,
        strength: clamp(parseFloat(el.getAttribute("data-magnetic")) || 0.16, 0.05, 0.3),
        degrees: clamp(parseFloat(el.getAttribute("data-tilt")) || 4, 1, 7), bounds: null };
      records.push(record);
      on(el, "pointerenter", function (event) { point(record, event); });
      on(el, "pointermove", function (event) { point(record, event); });
      on(el, "pointerleave", function () {
        if (!record.bounds) return;
        record.active = false; record.tx = record.ty = 0;
        moving.add(record); request();
      });
      on(el, "focusin", function () { resetRecord(record); });
    });
    if ("IntersectionObserver" in window && records.length) {
      var visibility = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          records.forEach(function (record) {
            if (record.el !== entry.target) return;
            record.visible = entry.isIntersecting;
            if (!record.visible) resetRecord(record);
          });
        });
      });
      records.forEach(function (record) { visibility.observe(record.el); });
    }

    if (doc.querySelector("[data-cursor]")) {
      cursor = doc.createElement("div");
      cursor.className = "motion-cursor";
      cursor.setAttribute("aria-hidden", "true");
      doc.body.appendChild(cursor);
      on(doc, "pointermove", function (event) {
        if (!enabled() || event.pointerType !== "mouse" || event.buttons || doc.body.classList.contains("is-locked")) { hideCursor(); return; }
        var target = event.target.closest && event.target.closest("[data-cursor]");
        if (!target || target.closest("[inert], .prose") || !target.getAttribute("data-cursor").trim()) { hideCursor(); return; }
        if (target !== cursorTarget) {
          cursorTarget = target;
          cursor.textContent = target.getAttribute("data-cursor").slice(0, 32);
          cursor.classList.add("is-active");
          cursorWidth = cursor.offsetWidth; cursorHeight = cursor.offsetHeight;
        }
        cursorX = event.clientX; cursorY = event.clientY; cursorDirty = true; request();
      }, { passive: true });
      on(doc, "pointerout", function (event) { if (!event.relatedTarget) hideCursor(); });
      on(doc, "keydown", hideCursor);
    }

    all("[data-drag-scroll]").filter(function (el) { return !el.closest(".prose"); }).forEach(function (rail) {
      var state = null;
      var suppressUntil = 0;
      if (!rail.hasAttribute("tabindex")) rail.setAttribute("tabindex", "0");
      if (!rail.hasAttribute("aria-label")) rail.setAttribute("aria-label", "横向浏览区域");
      if (!rail.hasAttribute("role")) rail.setAttribute("role", "region");
      function affordance() { rail.classList.toggle("motion-can-drag", fine.matches && rail.scrollWidth > rail.clientWidth + 2); }
      function finish(event, cancelled) {
        if (!state || (event && event.pointerId !== undefined && event.pointerId !== state.id)) return;
        var old = state;
        state = null;
        if (old.dragged && !cancelled) suppressUntil = performance.now() + 400;
        rail.classList.remove("is-motion-dragging");
        if (rail.hasPointerCapture && rail.hasPointerCapture(old.id)) rail.releasePointerCapture(old.id);
      }
      on(rail, "pointerdown", function (event) {
        if (!fine.matches || doc.hidden || event.pointerType !== "mouse" || event.button !== 0 ||
            event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || rail.scrollWidth <= rail.clientWidth + 2 ||
            event.target.closest("input, textarea, select, button, [contenteditable='true']")) return;
        suppressUntil = 0;
        state = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rail.scrollLeft, dragged: false };
      });
      on(window, "pointermove", function (event) {
        if (!state || event.pointerId !== state.id) return;
        var dx = event.clientX - state.x, dy = event.clientY - state.y;
        if (!state.dragged) {
          if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 7) { finish(event, true); return; }
          if (Math.abs(dx) < 7) return;
          state.dragged = true;
          rail.classList.add("is-motion-dragging");
          if (rail.setPointerCapture) { try { rail.setPointerCapture(event.pointerId); } catch (_) {} }
          var selection = window.getSelection();
          if (selection) selection.removeAllRanges();
        }
        event.preventDefault();
        rail.scrollLeft = state.left - dx;
      }, { passive: false });
      on(window, "pointerup", function (event) { finish(event, false); });
      on(window, "pointercancel", function (event) { finish(event, true); });
      on(rail, "lostpointercapture", function (event) { finish(event, true); });
      on(rail, "dragstart", function (event) { if (state) event.preventDefault(); });
      on(rail, "click", function (event) {
        if (event.detail > 0 && event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && performance.now() < suppressUntil) {
          event.preventDefault(); event.stopImmediatePropagation(); suppressUntil = 0;
        }
      }, true);
      on(rail, "keydown", function (event) {
        if (event.target !== rail || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
        var left = rail.scrollLeft;
        if (event.key === "ArrowRight") left += rail.clientWidth * 0.65;
        else if (event.key === "ArrowLeft") left -= rail.clientWidth * 0.65;
        else if (event.key === "Home") left = 0;
        else if (event.key === "End") left = rail.scrollWidth;
        else return;
        event.preventDefault(); rail.scrollTo({ left: left, behavior: reduced.matches ? "auto" : "smooth" });
      });
      rails.push({ reset: function () { finish(null, true); }, update: affordance });
      affordance();
    });

    function suspend() {
      resetMotion();
      rails.forEach(function (rail) { rail.reset(); });
      if (doc.hidden || reduced.matches) animations.forEach(function (_, el) { stopReveal(el); });
    }
    change(reduced, suspend);
    change(fine, function () { suspend(); rails.forEach(function (rail) { rail.update(); }); });
    on(doc, "visibilitychange", suspend);
    on(window, "pagehide", suspend);
    on(window, "blur", suspend);
    on(window, "scroll", resetMotion, { passive: true });
    on(window, "resize", function () { resetMotion(); rails.forEach(function (rail) { rail.update(); }); }, { passive: true });
  }
  if (doc.readyState === "loading") on(doc, "DOMContentLoaded", boot, { once: true });
  else boot();
})();
;
/* atelier-home.js */
/* Open a real entry from the historical archive. */
(function () {
  'use strict';
  function initPhotoFilm() {
    var rail = document.getElementById('home-photo-film');
    var tools = document.querySelector('[data-film-controls]');
    if (!rail || !tools) return;
    var cards = Array.from(rail.querySelectorAll('.field-frame'));
    var previous = tools.querySelector('[data-film-prev]');
    var next = tools.querySelector('[data-film-next]');
    var current = tools.querySelector('[data-film-current]');
    var progress = tools.querySelector('[data-film-progress]');
    var reduced = matchMedia('(prefers-reduced-motion: reduce)');
    var frame = 0;
    function index() {
      var max = rail.scrollWidth - rail.clientWidth;
      if (max > 0 && rail.scrollLeft >= max - 3) return cards.length - 1;
      var start = rail.getBoundingClientRect().left + parseFloat(getComputedStyle(rail).paddingLeft || 0);
      var closest = 0, distance = Infinity;
      cards.forEach(function (card, i) {
        var delta = Math.abs(card.getBoundingClientRect().left - start);
        if (delta < distance) { closest = i; distance = delta; }
      });
      return closest;
    }
    function update() {
      frame = 0;
      var max = Math.max(0, rail.scrollWidth - rail.clientWidth);
      var fraction = max ? Math.max(0, Math.min(1, rail.scrollLeft / max)) : 0;
      previous.disabled = rail.scrollLeft < 3;
      next.disabled = !max || rail.scrollLeft >= max - 3;
      current.textContent = String(index() + 1).padStart(2, '0');
      progress.style.setProperty('--film-progress', fraction);
      progress.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
    }
    function schedule() { if (!frame) frame = requestAnimationFrame(update); }
    function move(direction) {
      var target = cards[Math.max(0, Math.min(cards.length - 1, index() + direction))];
      if (!target) return;
      var inset = parseFloat(getComputedStyle(rail).paddingLeft || 0);
      var left = rail.scrollLeft + target.getBoundingClientRect().left - rail.getBoundingClientRect().left - inset;
      rail.scrollTo({ left: Math.max(0, left), behavior: reduced.matches ? 'auto' : 'smooth' });
    }
    previous.addEventListener('click', function () { move(-1); });
    next.addEventListener('click', function () { move(1); });
    rail.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('pagehide', function () { if (frame) cancelAnimationFrame(frame); frame = 0; });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
    tools.hidden = false;
    update();
  }
  function initRandomReading() {
    var buttons = Array.from(document.querySelectorAll('[data-random-story]'));
    if (!buttons.length) return;
    var base = document.body.getAttribute('data-base') || '', pending;
    buttons.forEach(function (button) {
      button.addEventListener('click', function () {
        var markup = button.innerHTML;
        button.disabled = true; button.setAttribute('aria-busy', 'true'); button.textContent = '正在翻开一段行走…';
        if (!pending) pending = fetch(base + 'assets/data/search.json').then(function (response) {
          if (!response.ok) throw new Error('Index unavailable');
          return response.json();
        }).then(function (rows) { return rows.filter(function (row) { return /^posts\/[^?#]+\.html$/.test(row[4]); }); });
        pending.then(function (rows) {
          if (!rows.length) throw new Error('Empty index');
          var path = rows[Math.floor(Math.random() * rows.length)][4];
          button.innerHTML = markup; button.disabled = false; button.removeAttribute('aria-busy');
          location.assign(base + path);
        }).catch(function () {
          pending = null; button.innerHTML = markup; button.disabled = false; button.removeAttribute('aria-busy');
          location.assign(base + 'archive.html');
        });
      });
    });
  }
  function boot() { initRandomReading(); initPhotoFilm(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();

/* 27. 期次索引：跟随鼠标的玻璃光 */
(function () {
  "use strict";
})();
;
/* home-carousel.js */
/* Each photograph keeps its static first frame unless enhancement succeeds. */
(function () {
  "use strict";
  var doc = document;
  function on(el, type, fn, options) { if (el) el.addEventListener(type, fn, options || false); }
  function all(selector, root) { return Array.prototype.slice.call(root.querySelectorAll(selector)); }

  function enhance(region) {
    // The small print is nested inside the cover: separate attributes keep
    // either carousel from claiming the other's slides and controls.
    var prefix = region.hasAttribute("data-inset-carousel") ? "inset" : "carousel";
    function attr(name) { return "data-" + prefix + "-" + name; }
    function find(name) { return region.querySelector("[" + attr(name) + "]"); }
    if (region.hasAttribute(attr("enhanced"))) return;
    var slides = all("[" + attr("slide") + "]", region);
    if (!slides.length) return;
    var controls = find("controls");
    var previous = find("prev");
    var next = find("next");
    var toggle = find("toggle");
    var dots = all("[" + attr("go") + "]", region);
    var count = find("count");
    var status = find("status");
    var captionLeft = find("caption-left");
    var captionRight = find("caption-right");
    var captionLink = find("caption-link");
    // The inset print moves inside a stationary interaction area.
    var photo = prefix === "inset" ? region : find("photo") || region.querySelector(".field-cover__photo") || slides[0].parentElement;
    var interval = Math.max(3000, Math.min(30000, Number(region.getAttribute(attr("interval"))) || 6000));
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    var current = Math.max(0, slides.findIndex(function (image) { return !image.hidden; }));
    var desired = current;
    var userIntent = null;
    var hovered = false;
    var focused = region.contains(doc.activeElement);
    var touching = false;
    var visible = false;
    var pending = false;
    var timer = null;
    var sequence = 0;
    var transition = null;
    var swipe = null;
    var swallowClickUntil = 0;
    var records = slides.map(function (image) {
      return { image: image, state: "idle", promise: null, z: image.style.zIndex };
    });
    var dotLabels = dots.map(function (button) { return button.getAttribute("aria-label") || "第 " + (Number(button.getAttribute(attr("go"))) + 1) + " 幅"; });

    function wantsPlay() { return userIntent === null ? !reduced.matches : userIntent; }
    function usableCount() { return records.filter(function (record) { return record.state !== "error"; }).length; }
    function clearClock() { if (timer !== null) clearTimeout(timer); timer = null; }
    function canRotate() { return wantsPlay() && visible && !hovered && !focused && !touching && !doc.hidden && usableCount() > 1; }
    function schedule() {
      clearClock();
      if (!pending && canRotate()) timer = setTimeout(function () {
        timer = null;
        if (canRotate()) select(adjacent(current, 1), "auto", 1, slides.length);
      }, interval);
    }
    function announce(message) { if (status) status.textContent = message; }
    function syncControls() {
      if (count) count.textContent = String(current + 1).padStart(2, "0") + " / " + String(slides.length).padStart(2, "0");
      dots.forEach(function (button, i) {
        var index = Number(button.getAttribute(attr("go")));
        var valid = Number.isInteger(index) && index >= 0 && index < slides.length;
        var failed = valid && records[index].state === "error";
        button.setAttribute("aria-pressed", index === current ? "true" : "false");
        button.disabled = !valid || failed;
        button.setAttribute("aria-label", dotLabels[i] + (failed ? "，图片暂不可用" : ""));
      });
      if (previous) previous.disabled = usableCount() < 2;
      if (next) next.disabled = usableCount() < 2;
      if (toggle) {
        toggle.disabled = usableCount() < 2;
        toggle.textContent = wantsPlay() ? "暂停" : "播放";
        toggle.setAttribute("aria-label", wantsPlay() ? "暂停自动播放" : "开始自动播放");
        toggle.setAttribute("aria-pressed", wantsPlay() ? "false" : "true");
      }
    }
    function normalize() {
      records.forEach(function (record, i) {
        record.image.hidden = i !== current;
        record.image.style.zIndex = record.z;
        record.image.setAttribute("aria-hidden", i === current ? "false" : "true");
      });
    }
    function finishVisuals() {
      var old = transition;
      transition = null;
      if (old) old.animation.cancel();
      normalize();
    }
    function pauseEnvironment() { clearClock(); finishVisuals(); }
    function adjacent(start, direction) {
      for (var step = 1; step <= slides.length; step++) {
        var index = (start + direction * step + slides.length * 2) % slides.length;
        if (records[index].state !== "error") return index;
      }
      return current;
    }
    function prepare(index) {
      var record = records[index], image = record.image;
      if (record.state === "ready" && image.complete && image.naturalWidth) return Promise.resolve();
      if (record.promise) return record.promise;
      record.state = "loading";
      record.promise = new Promise(function (resolve, reject) {
        var settled = false;
        function cleanup() { image.removeEventListener("load", loaded); image.removeEventListener("error", failed); }
        function failed() {
          if (settled) return;
          settled = true; cleanup(); reject(new Error("Cover image unavailable"));
        }
        function ready() {
          if (settled) return;
          if (!image.naturalWidth) { failed(); return; }
          settled = true; cleanup(); resolve();
        }
        function loaded() {
          if (settled) return;
          if (image.decode) image.decode().then(ready, failed);
          else ready();
        }
        image.addEventListener("load", loaded);
        image.addEventListener("error", failed);
        // Hidden lazy images otherwise need never start their request.
        image.loading = "eager";
        if (image.complete) { if (image.naturalWidth) loaded(); else failed(); }
      }).then(function () { record.state = "ready"; }, function (error) { record.state = "error"; throw error; });
      return record.promise;
    }
    function commit(index, origin) {
      var old = current;
      finishVisuals();
      current = desired = index;
      if (captionLeft) captionLeft.textContent = slides[index].getAttribute("data-caption-left") || "";
      if (captionRight) captionRight.textContent = slides[index].getAttribute("data-caption-right") || "";
      if (captionLink) {
        var href = slides[index].getAttribute("data-href");
        captionLink.hidden = !href;
        if (href) captionLink.setAttribute("href", href);
        else captionLink.removeAttribute("href");
      }
      normalize();
      if (old !== index && !reduced.matches && visible && !doc.hidden && slides[index].animate) {
        slides[old].hidden = false;
        slides[old].setAttribute("aria-hidden", "true");
        slides[old].style.zIndex = "1";
        slides[index].style.zIndex = "2";
        try {
          var owned = { animation: slides[index].animate([{ opacity: 0 }, { opacity: 1 }],
            { duration: 650, easing: "ease-in-out", fill: "both" }) };
          transition = owned;
          function done() { if (transition === owned) finishVisuals(); }
          owned.animation.finished.then(done, done);
        } catch (_) { normalize(); }
      }
      syncControls();
      if (origin === "manual") announce("第 " + (index + 1) + " 幅，共 " + slides.length + " 幅。" +
        (slides[index].getAttribute("data-caption-left") || slides[index].alt || ""));
    }
    function select(index, origin, direction, budget) {
      if (index < 0 || index >= slides.length) return;
      var request = ++sequence;
      desired = index;
      pending = true;
      clearClock();
      finishVisuals();
      region.setAttribute("aria-busy", "true");
      prepare(index).then(function () {
        if (request !== sequence) return;
        pending = false;
        region.removeAttribute("aria-busy");
        // A pending automatic fetch cannot turn a pause into a late slide change.
        if (origin === "auto" && !canRotate()) { desired = current; schedule(); return; }
        commit(index, origin);
        schedule();
      }, function () {
        syncControls();
        if (request !== sequence) return;
        pending = false;
        desired = current;
        region.removeAttribute("aria-busy");
        var fallback = adjacent(index, direction || 1);
        if (direction && budget > 1 && fallback !== current && fallback !== index) {
          select(fallback, origin, direction, budget - 1);
        } else {
          if (origin === "manual") announce("这幅图片暂不可用，已保留当前画面。");
          schedule();
        }
      });
    }
    function move(direction) { select(adjacent(desired, direction), "manual", direction, slides.length); }
    on(previous, "click", function () { move(-1); });
    on(next, "click", function () { move(1); });
    dots.forEach(function (button) { on(button, "click", function () {
      if (!button.disabled) select(Number(button.getAttribute(attr("go"))), "manual", 0, 1);
    }); });
    on(toggle, "click", function () {
      userIntent = !wantsPlay();
      pauseEnvironment(); syncControls(); schedule();
      announce(wantsPlay() ? "自动播放已开启；移出鼠标并离开轮播焦点后继续。" : "自动播放已暂停。");
    });
    on(region, "keydown", function (event) {
      if (event.target.closest("[data-home-carousel], [data-inset-carousel]") !== region) return;
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.isComposing ||
          event.target.closest("input, textarea, select, [contenteditable='true']")) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault(); move(event.key === "ArrowLeft" ? -1 : 1);
    });
    on(region, "pointerenter", function (event) { if (event.pointerType === "mouse") { hovered = true; pauseEnvironment(); } });
    on(region, "pointerleave", function (event) { if (event.pointerType === "mouse") { hovered = false; schedule(); } });
    on(region, "focusin", function () { focused = true; pauseEnvironment(); });
    on(region, "focusout", function (event) {
      if (event.relatedTarget && region.contains(event.relatedTarget)) return;
      focused = false; schedule();
    });
    on(photo, "touchstart", function (event) {
      touching = true;
      pauseEnvironment();
      if (event.touches.length !== 1) { swipe = null; return; }
      var point = event.touches[0];
      swipe = { id: point.identifier, x: point.clientX, y: point.clientY, time: performance.now() };
    }, { passive: true });
    on(photo, "touchmove", function (event) { if (event.touches.length !== 1) swipe = null; }, { passive: true });
    on(photo, "touchcancel", function (event) {
      swipe = null; touching = !!(event.touches && event.touches.length);
      if (!touching) schedule();
    }, { passive: true });
    on(photo, "touchend", function (event) {
      touching = !!(event.touches && event.touches.length);
      if (touching) { swipe = null; return; }
      if (!swipe) { schedule(); return; }
      var start = swipe; swipe = null;
      var point = Array.prototype.filter.call(event.changedTouches, function (item) { return item.identifier === start.id; })[0];
      if (!point) { schedule(); return; }
      var dx = point.clientX - start.x, dy = point.clientY - start.y;
      if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy) * 1.4 && performance.now() - start.time < 900) {
        move(dx < 0 ? 1 : -1); swallowClickUntil = performance.now() + 500;
      }
      schedule();
    }, { passive: true });
    on(photo, "click", function (event) {
      if (event.detail > 0 && event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && performance.now() < swallowClickUntil) {
        event.preventDefault(); event.stopImmediatePropagation(); swallowClickUntil = 0;
      }
    }, true);

    function measureVisible() {
      var rect = region.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
    }
    function visibility(value) {
      if (visible === value) return;
      visible = value;
      if (!visible) pauseEnvironment();
      else schedule();
    }
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) { visibility(entries[0].isIntersecting); }).observe(region);
    } else {
      visible = measureVisible();
      on(window, "scroll", function () { visibility(measureVisible()); }, { passive: true });
      on(window, "resize", function () { visibility(measureVisible()); }, { passive: true });
    }
    on(doc, "visibilitychange", function () {
      if (doc.hidden) { touching = false; swipe = null; pauseEnvironment(); }
      else schedule();
    });
    on(window, "pagehide", function () {
      ++sequence; pending = false; desired = current; touching = false; swipe = null;
      region.removeAttribute("aria-busy"); pauseEnvironment();
    });
    on(window, "pageshow", function () { visibility(measureVisible()); schedule(); });
    function preference() {
      if (reduced.matches && userIntent === true) userIntent = null;
      pauseEnvironment(); syncControls(); schedule();
    }
    if (reduced.addEventListener) on(reduced, "change", preference);
    else if (reduced.addListener) reduced.addListener(preference);
    region.setAttribute(attr("enhanced"), "");
    if (!region.hasAttribute("aria-roledescription")) region.setAttribute("aria-roledescription", "轮播");
    if (controls) controls.hidden = false;
    syncControls();
    select(current, "initial", 1, slides.length);
  }
  function boot() { all("[data-home-carousel], [data-inset-carousel]", doc).forEach(enhance); }
  if (doc.readyState === "loading") on(doc, "DOMContentLoaded", boot, { once: true });
  else boot();
})();
;
/* slider-system.js */
/* Optional inline slider: arrows, drag, keyboard and a progress line.
   Without JavaScript the rail still scrolls and every slide stays visible. */
(function () {
  "use strict";
  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function init(root) {
    var rail = root.querySelector("[data-slider-rail]");
    if (!rail) return;
    var slides = Array.prototype.filter.call(rail.children, function (el) {
      return el.nodeType === 1;
    });
    if (slides.length < 2) { rail.removeAttribute("tabindex"); return; }

    var prevBtn = root.querySelector("[data-slider-prev]");
    var nextBtn = root.querySelector("[data-slider-next]");
    var indexEl = root.querySelector("[data-slider-index]");
    var totalEl = root.querySelector("[data-slider-total]");
    var fillEl = root.querySelector("[data-slider-progress]");
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    var count = slides.length;
    var frame = 0;
    var dragging = false;
    var dragStartX = 0;
    var dragStartScroll = 0;
    var suppressClick = false;
    var pointerId = null;
    var clickResetTimer = 0;

    if (totalEl) totalEl.textContent = pad(count);

    function offsetOf(i) {
      return slides[i].getBoundingClientRect().left - rail.getBoundingClientRect().left + rail.scrollLeft;
    }

    function current() {
      var max = rail.scrollWidth - rail.clientWidth;
      if (max > 0 && rail.scrollLeft >= max - 4) return count - 1;
      if (rail.scrollLeft <= 4) return 0;
      var best = 0;
      var min = Infinity;
      for (var i = 0; i < count; i++) {
        var d = Math.abs(offsetOf(i) - rail.scrollLeft);
        if (d < min) { min = d; best = i; }
      }
      return best;
    }

    function update() {
      var cur = current();
      if (indexEl) indexEl.textContent = pad(cur + 1);
      if (fillEl) fillEl.style.transform = "scaleX(" + (count > 1 ? cur / (count - 1) : 1) + ")";
      if (prevBtn) prevBtn.disabled = cur <= 0;
      if (nextBtn) nextBtn.disabled = cur >= count - 1;
      slides.forEach(function (el, i) {
        el.classList.toggle("is-current", i === cur);
      });
    }

    function goTo(i) {
      i = Math.max(0, Math.min(count - 1, i));
      rail.scrollTo({ left: offsetOf(i), behavior: reduced.matches ? "auto" : "smooth" });
    }

    function onScroll() {
      if (frame) return;
      frame = window.requestAnimationFrame(function () {
        frame = 0;
        update();
      });
    }

    rail.addEventListener("scroll", onScroll, { passive: true });
    var resizeTimer = 0;
    window.addEventListener("resize", function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(update, 150);
    });

    if (prevBtn) prevBtn.addEventListener("click", function () { goTo(current() - 1); });
    if (nextBtn) nextBtn.addEventListener("click", function () { goTo(current() + 1); });

    rail.addEventListener("keydown", function (event) {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.isComposing ||
          event.target.closest("input, textarea, select, [contenteditable='true']")) return;
      if (event.key === "ArrowRight") { event.preventDefault(); goTo(current() + 1); }
      else if (event.key === "ArrowLeft") { event.preventDefault(); goTo(current() - 1); }
      else if (event.key === "Home") { event.preventDefault(); goTo(0); }
      else if (event.key === "End") { event.preventDefault(); goTo(count - 1); }
    });

    rail.addEventListener("pointerdown", function (event) {
      if (event.pointerType !== "mouse" || event.button !== 0 || event.isPrimary === false ||
          event.ctrlKey || event.metaKey || event.altKey || event.shiftKey ||
          event.target.closest("button, input, textarea, select, [contenteditable='true']")) return;
      window.clearTimeout(clickResetTimer);
      clickResetTimer = 0;
      suppressClick = false;
      dragging = true;
      pointerId = event.pointerId;
      dragStartX = event.clientX;
      dragStartScroll = rail.scrollLeft;
    });
    window.addEventListener("pointermove", function (event) {
      if (!dragging || event.pointerId !== pointerId) return;
      if (event.buttons === 0) { finishDrag(event, true); return; }
      var dx = event.clientX - dragStartX;
      if (Math.abs(dx) > 4) {
        if (!suppressClick && rail.setPointerCapture) {
          try { rail.setPointerCapture(pointerId); } catch (_) {}
        }
        suppressClick = true;
        rail.classList.add("is-dragging");
        if (event.cancelable) event.preventDefault();
        rail.scrollLeft = dragStartScroll - dx;
      }
    });
    function finishDrag(event, cancelled) {
      if (!dragging || (event && event.pointerId !== undefined && event.pointerId !== pointerId)) return;
      var ownedPointer = pointerId;
      var didDrag = suppressClick;
      dragging = false;
      pointerId = null;
      rail.classList.remove("is-dragging");
      if (rail.releasePointerCapture) {
        try { rail.releasePointerCapture(ownedPointer); } catch (_) {}
      }
      window.clearTimeout(clickResetTimer);
      clickResetTimer = 0;
      if (cancelled || !didDrag) { suppressClick = false; return; }
      // The click generated by this completed drag must not activate a story.
      clickResetTimer = window.setTimeout(function () { suppressClick = false; clickResetTimer = 0; }, 0);
      goTo(current());
    }
    window.addEventListener("pointerup", function (event) { finishDrag(event, false); });
    window.addEventListener("pointercancel", function (event) { finishDrag(event, true); });
    window.addEventListener("blur", function () { finishDrag(null, true); });
    rail.addEventListener("lostpointercapture", function (event) { finishDrag(event, true); });
    rail.addEventListener("dragstart", function (event) {
      // Links remain clickable, but a browser-native link drag must not steal
      // pointerup and leave the horizontal rail stuck in its dragging state.
      if (dragging) event.preventDefault();
    });
    rail.addEventListener("dragend", function () { finishDrag(null, true); });
    rail.addEventListener("click", function (event) {
      if (suppressClick) { event.preventDefault(); event.stopPropagation(); }
    }, true);

    update();
    window.addEventListener("load", update);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(update).catch(function () {});
  }

  function boot() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-slider]"), init);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
;
/* cursor-glow.js */
/* Site-wide pointer light: a small lamp that follows the mouse on every
   page. It samples what sits beneath the pointer and flips between a warm
   light (dark grounds, screen) and a soft warm shade (paper, multiply). */
(function () {
  var fine = window.matchMedia("(hover: hover) and (pointer: fine)");
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (!fine.matches || reduced.matches) return;

  var el = document.createElement("div");
  el.className = "cursor-glow";
  el.setAttribute("aria-hidden", "true");
  document.body.appendChild(el);

  var raf = 0;
  var x = -999;
  var y = -999;
  var sampled = 0;
  var mode = "";

  function paint() {
    raf = 0;
    el.style.setProperty("--cgx", x.toFixed(1) + "px");
    el.style.setProperty("--cgy", y.toFixed(1) + "px");
  }

  function luma(color) {
    var m = color.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    var p = m[1].split(",").map(function (v) { return parseFloat(v); });
    var a = p.length > 3 ? p[3] : 1;
    if (!a || a < 0.35) return null;
    return (0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]) / 255;
  }

  function backdropLuma() {
    var nodes = document.elementsFromPoint(x, y) || [];
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      if (!node || node === el || node === document.documentElement) continue;
      if (node.tagName === "IMG" || node.tagName === "VIDEO") return 0.22;
      var style = window.getComputedStyle(node);
      var l = luma(style.backgroundColor);
      if (l !== null) return l;
    }
    return 0.9;
  }

  function tone() {
    var now = Date.now();
    if (now - sampled < 140) return;
    sampled = now;
    var next = backdropLuma() < 0.46 ? "ink" : "paper";
    if (next === mode) return;
    mode = next;
    if (next === "ink") {
      el.style.setProperty("--cg-core", "rgba(255, 248, 228, 0.30)");
      el.style.setProperty("--cg-glow", "rgba(225, 238, 194, 0.22)");
      el.style.setProperty("--cg-blend", "normal");
    } else {
      el.style.setProperty("--cg-core", "rgba(255, 248, 228, 0.30)");
      el.style.setProperty("--cg-glow", "rgba(225, 238, 194, 0.22)");
      el.style.setProperty("--cg-blend", "normal");
    }
  }

  function move(event) {
    if (event.pointerType && event.pointerType !== "mouse") return;
    x = event.clientX;
    y = event.clientY;
    tone();
    el.classList.add("is-on");
    if (!raf) raf = window.requestAnimationFrame(paint);
  }

  function hide() {
    el.classList.remove("is-on");
  }

  document.addEventListener("pointermove", move, { passive: true });
  document.addEventListener("pointerdown", move, { passive: true });
  document.addEventListener("mouseleave", hide);
  window.addEventListener("blur", hide);
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) hide();
  });
})();
;
/* nav-island.js */
/* ------------------------------------------------------------------------
   Liquid-glass dynamic-island navigation.
   Progressive enhancement on top of the shared header markup:
   - a pointer-following specular glow and a gliding "droplet" behind links
   - the capsule condenses while scrolling down, and blooms open on hover,
     on keyboard focus, or when the reader scrolls back up
   - a hairline scroll-progress line along the bottom of the capsule
   ------------------------------------------------------------------------ */
(function () {
  "use strict";

  var nav = document.querySelector("[data-nav]");
  if (!nav) return;
  var inner = nav.querySelector(".nav__inner");
  if (!inner) return;

  var links = nav.querySelector(".nav__links");
  var tools = nav.querySelector(".nav__tools");
  var brand = nav.querySelector(".brand");
  var motionPreference = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
  var pointerPreference = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)");

  /* ---------------------------------------------------------- scaffolding */
  var glow = document.createElement("span");
  glow.className = "nav__glow";
  glow.setAttribute("aria-hidden", "true");
  inner.appendChild(glow);

  var progress = document.createElement("span");
  progress.className = "nav__progress";
  progress.setAttribute("aria-hidden", "true");
  progress.appendChild(document.createElement("span"));
  inner.appendChild(progress);

  var now = document.createElement("span");
  now.className = "nav__now";
  now.setAttribute("aria-hidden", "true");
  if (tools && tools.parentNode === inner) inner.insertBefore(now, tools);
  else inner.appendChild(now);

  var drop = null;
  var activeLink = null;
  var hoverLink = null;
  if (links) {
    drop = document.createElement("span");
    drop.className = "nav__drop";
    drop.setAttribute("aria-hidden", "true");
    links.appendChild(drop);
    activeLink = links.querySelector("a.is-active") || links.querySelector("a");
    if (activeLink) now.textContent = activeLink.textContent.replace(/\s+/g, " ").trim();
  }

  /* --------------------------------------------------------- drop & glow */
  function placeDrop(link) {
    if (!drop || !links) return;
    if (!link || condensed) {
      drop.classList.remove("is-visible");
      return;
    }
    var lr = links.getBoundingClientRect();
    var r = link.getBoundingClientRect();
    if (!r.width) {
      drop.classList.remove("is-visible");
      return;
    }
    drop.style.left = Math.round(r.left - lr.left + 2) + "px";
    drop.style.width = Math.round(r.width - 4) + "px";
    drop.classList.add("is-visible");
  }

  if (links) {
    links.addEventListener("pointerover", function (e) {
      var a = e.target.closest ? e.target.closest("a") : null;
      if (!a || !links.contains(a)) return;
      hoverLink = a;
      placeDrop(a);
    });
    links.addEventListener("pointerleave", function () {
      hoverLink = null;
      placeDrop(activeLink);
    });
    links.addEventListener("focusin", function (e) {
      var a = e.target.closest ? e.target.closest("a") : null;
      if (a) placeDrop(a);
    });
    links.addEventListener("focusout", function (e) {
      if (e.relatedTarget && links.contains(e.relatedTarget)) return;
      placeDrop(hoverLink || activeLink);
    });
  }

  var glowX = 0;
  var glowY = 0;
  var glowRaf = 0;
  function canGlow() {
    return !document.hidden && motionPreference && !motionPreference.matches &&
      pointerPreference && pointerPreference.matches;
  }
  function cancelGlow(clear) {
    if (glowRaf) window.cancelAnimationFrame(glowRaf);
    glowRaf = 0;
    if (clear) {
      inner.style.removeProperty("--island-x");
      inner.style.removeProperty("--island-y");
      inner.style.removeProperty("--island-glow");
    }
  }
  function syncGlowPreference() {
    cancelGlow(true);
    glow.hidden = !canGlow();
  }
  inner.addEventListener("pointermove", function (e) {
    if (!canGlow() || (e.pointerType && e.pointerType !== "mouse")) return;
    // Save only the latest input. Geometry is read once in the display frame,
    // so high-rate mouse events never repeatedly force a layout measurement.
    glowX = e.clientX;
    glowY = e.clientY;
    if (glowRaf) return;
    glowRaf = window.requestAnimationFrame(function () {
      glowRaf = 0;
      if (!canGlow()) { glow.hidden = true; return; }
      var r = inner.getBoundingClientRect();
      inner.style.setProperty("--island-x", (glowX - r.left) + "px");
      inner.style.setProperty("--island-y", (glowY - r.top) + "px");
      inner.style.setProperty("--island-glow", Math.max(120, Math.min(260, r.width * 0.35)) + "px");
    });
  });
  function watchPreference(media) {
    if (!media) return;
    if (media.addEventListener) media.addEventListener("change", syncGlowPreference);
    else if (media.addListener) media.addListener(syncGlowPreference);
  }
  watchPreference(motionPreference);
  watchPreference(pointerPreference);
  document.addEventListener("visibilitychange", syncGlowPreference);
  window.addEventListener("pagehide", function () { cancelGlow(true); glow.hidden = true; });
  window.addEventListener("pageshow", syncGlowPreference);
  syncGlowPreference();

  /* -------------------------------------------------------- pointer light */
  var islands = [brand, links, tools].filter(Boolean);
  var lights = islands.map(function (island) {
    var light = document.createElement("span");
    light.className = "nav__light";
    light.setAttribute("aria-hidden", "true");
    island.appendChild(light);
    return { island: island, light: light, x: 0, y: 0, tx: 0, ty: 0, on: 0, ton: 0 };
  });
  var lightFrame = 0;

  /* ------------------------------------- smoked glass, island by island */
  var layers = islands.map(function (island) {
    var frost = document.createElement("span");
    frost.className = "nav__frost";
    frost.setAttribute("aria-hidden", "true");
    island.insertBefore(frost, island.firstChild);
    var shade = document.createElement("span");
    shade.className = "nav__shade";
    shade.setAttribute("aria-hidden", "true");
    island.insertBefore(shade, frost.nextSibling);
    return { island: island, frost: frost, shade: shade, dark: 0, goal: 0 };
  });
  var darkFrame = 0;

  function lightAllowed() {
    return !document.hidden &&
      !(motionPreference && motionPreference.matches) &&
      !!(pointerPreference && pointerPreference.matches);
  }

  function paintLight(item) {
    item.island.style.setProperty("--plx", item.x.toFixed(1) + "px");
    item.island.style.setProperty("--ply", item.y.toFixed(1) + "px");
    item.island.style.setProperty("--pl-on", item.on.toFixed(3));
  }

  function lightTick() {
    lightFrame = 0;
    var busy = false;
    lights.forEach(function (item) {
      // fade in gently, snap away quickly, so two islands are never lit together
      item.on += (item.ton - item.on) * (item.ton > item.on ? 0.18 : 0.4);
      item.x += (item.tx - item.x) * 0.2;
      item.y += (item.ty - item.y) * 0.2;
      if (Math.abs(item.ton - item.on) < 0.004) item.on = item.ton;
      if (Math.abs(item.tx - item.x) < 0.25) item.x = item.tx;
      if (Math.abs(item.ty - item.y) < 0.25) item.y = item.ty;
      paintLight(item);
      if (item.on !== item.ton || item.x !== item.tx || item.y !== item.ty) busy = true;
    });
    if (busy) lightFrame = window.requestAnimationFrame(lightTick);
  }

  function scheduleLight() {
    if (!lightFrame) lightFrame = window.requestAnimationFrame(lightTick);
  }

  function clearLights() {
    lights.forEach(function (item) {
      item.ton = 0;
      item.on = 0;
      paintLight(item);
    });
    scheduleLight();
  }

  function trackLights(e) {
    lights.forEach(function (item) {
      var r = item.island.getBoundingClientRect();
      var inside = r.width > 0 &&
        e.clientX >= r.left && e.clientX <= r.right &&
        e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) {
        // hard cut: an island that is not under the pointer never keeps a glow
        item.ton = 0;
        item.on = 0;
        paintLight(item);
        return;
      }
      item.tx = Math.max(0, Math.min(r.width, e.clientX - r.left));
      item.ty = Math.max(0, Math.min(r.height, e.clientY - r.top));
      item.ton = 1;
    });
    scheduleLight();
  }

  inner.addEventListener("pointermove", function (e) {
    if (!lightAllowed()) return;
    if (e.pointerType && e.pointerType !== "mouse") return;
    trackLights(e);
  });
  inner.addEventListener("pointerleave", clearLights);
  window.addEventListener("blur", clearLights);
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) clearLights();
  });
  if (motionPreference && motionPreference.addEventListener) {
    motionPreference.addEventListener("change", function () {
      if (!lightAllowed()) clearLights();
    });
  }
  if (pointerPreference && pointerPreference.addEventListener) {
    pointerPreference.addEventListener("change", function () {
      if (!lightAllowed()) clearLights();
    });
  }

  /* --------------------------------------------------- condensed / expand */
  var condensed = false;
  var hovering = false;
  var focusInside = false;
  var lastY = window.scrollY || window.pageYOffset || 0;
  var direction = "down";
  var raf = 0;

  function setCondensed(next) {
    next = !!next;
    if (next === condensed) return;
    condensed = next;
    nav.classList.toggle("is-condensed", condensed);
    placeDrop(hoverLink || activeLink);
  }

  function shouldCondense() {
    var y = window.scrollY || window.pageYOffset || 0;
    if (y < 46) return false;
    if (hovering || focusInside) return false;
    if (direction === "up") return false;
    return y > 88;
  }

  function update() {
    raf = 0;
    var y = window.scrollY || window.pageYOffset || 0;
    var dy = y - lastY;
    if (Math.abs(dy) > 4) {
      direction = dy > 0 ? "down" : "up";
      lastY = y;
    }
    setCondensed(shouldCondense());
    var doc = document.documentElement;
    var max = Math.max(1, doc.scrollHeight - window.innerHeight);
    inner.style.setProperty("--island-progress", Math.min(1, Math.max(0, y / max)).toFixed(4));
    detectBackdrop();
  }

  /* ------------------------------------------ live backdrop reading (v2)
     Sample the stack behind the capsule and flip the material to its dark
     state when photographs or dark sections slide underneath it. Three
     probes is enough and it runs at most every 120ms.                      */
  var lastDetect = 0;

  function glassLuma(color) {
    var m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,\/]\s*([\d.]+))?\s*\)/.exec(
      color || ""
    );
    if (!m) return null;
    return {
      a: m[4] === undefined ? 1 : parseFloat(m[4]),
      l:
        (0.2126 * parseFloat(m[1]) +
          0.7152 * parseFloat(m[2]) +
          0.0722 * parseFloat(m[3])) /
        255
    };
  }

  function backdropProbe(x, y) {
    var stack = document.elementsFromPoint ? document.elementsFromPoint(x, y) : [];
    var content = null;
    for (var i = 0; i < stack.length; i += 1) {
      var node = stack[i];
      if (node === nav || nav.contains(node)) continue;
      content = node;
      break;
    }
    if (!content) return false;
    var photoSelector =
      ".field-cover__visual, .field-cover__photo, .home-carousel__stage, .phero, .field-atlas, .masonry, .field-film, .exp-detail__image, .field-cover__inset, .field-manifesto__snapshot, .namecloud, .lb";
    var probe = content;
    for (var depth = 0; depth < 6 && probe && probe.nodeType === 1; depth += 1) {
      if (probe.tagName === "IMG") return true;
      var cs = window.getComputedStyle(probe);
      if (probe.matches && probe.matches(photoSelector)) {
        if (cs.backgroundImage && cs.backgroundImage !== "none") return true;
      }
      var luma = glassLuma(cs.backgroundColor);
      if (luma && luma.a > 0.35) return luma.l < 0.5;
      probe = probe.parentElement;
    }
    return false;
  }

  /* ---------------------------------- smoked glass, sampled point by point
     The bar is read as a strip: every ~22px the backdrop is measured, each
     island draws a horizontal smoke gradient from those readings, and every
     word takes its ink from the spot it sits on. One island can therefore be
     half cream and half smoked, depending on what is behind it. */
  var PROFILE_STEP = 22;
  var profile = [];
  var lastDetect = 0;
  var inkEls = null;

  function lumaAt(x, y) {
    var stack = document.elementsFromPoint ? document.elementsFromPoint(x, y) : [];
    var content = null;
    for (var i = 0; i < stack.length; i += 1) {
      var node = stack[i];
      if (node === nav || nav.contains(node)) continue;
      content = node;
      break;
    }
    if (!content) return null;
    var photoSelector =
      ".field-cover__visual, .field-cover__photo, .home-carousel__stage, .phero, .field-atlas, .masonry, .field-film, .exp-detail__image, .field-cover__inset, .field-manifesto__snapshot, .namecloud, .lb";
    var probe = content;
    for (var depth = 0; depth < 6 && probe && probe.nodeType === 1; depth += 1) {
      if (probe.tagName === "IMG") return 0.12;
      var cs = window.getComputedStyle(probe);
      if (probe.matches && probe.matches(photoSelector)) {
        if (cs.backgroundImage && cs.backgroundImage !== "none") return 0.18;
      }
      var luma = glassLuma(cs.backgroundColor);
      if (luma && luma.a > 0.35) return luma.l;
      probe = probe.parentElement;
    }
    return null;
  }

  function darknessAt(x, y) {
    var l = lumaAt(x, y);
    if (l === null) return 0;
    return Math.max(0, Math.min(1, (0.62 - l) * 2.4 + 0.12));
  }

  function detectProfile() {
    var now = Date.now();
    if (now - lastDetect < 110) return;
    lastDetect = now;
    var rects = [];
    layers.forEach(function (layer) {
      var r = layer.island.getBoundingClientRect();
      if (r.width > 4 && r.bottom > 0 && r.top < window.innerHeight) rects.push(r);
    });
    if (!rects.length) {
      profile.forEach(function (s) { s.goal = 0; });
      scheduleDark();
      return;
    }
    var left = rects[0].left;
    var right = rects[0].right;
    var y = rects[0].top + rects[0].height * 0.55;
    for (var i = 1; i < rects.length; i += 1) {
      left = Math.min(left, rects[i].left);
      right = Math.max(right, rects[i].right);
    }
    var count = Math.max(4, Math.round((right - left) / PROFILE_STEP) + 1);
    var goals = [];
    for (var k = 0; k < count; k += 1) {
      goals.push(darknessAt(Math.round(left + ((right - left) * k) / (count - 1)), Math.round(y)));
    }
    var smooth = goals.map(function (_, k) {
      var sum = 0;
      var n = 0;
      for (var j = Math.max(0, k - 2); j <= Math.min(count - 1, k + 2); j += 1) {
        sum += goals[j];
        n += 1;
      }
      return Math.min(1, (sum / n) * 1.18);
    });
    if (profile.length !== count) {
      profile = smooth.map(function (v, idx) {
        return { x: left + ((right - left) * idx) / (count - 1), v: v, goal: v };
      });
    } else {
      for (var m = 0; m < count; m += 1) {
        profile[m].x = left + ((right - left) * m) / (count - 1);
        profile[m].goal = smooth[m];
      }
    }
    scheduleDark();
  }

  function valueAt(x) {
    if (!profile.length) return 0;
    if (x <= profile[0].x) return profile[0].v;
    var last = profile.length - 1;
    if (x >= profile[last].x) return profile[last].v;
    for (var i = 1; i <= last; i += 1) {
      if (profile[i].x >= x) {
        var a = profile[i - 1];
        var b = profile[i];
        var t = (x - a.x) / Math.max(1, b.x - a.x);
        return a.v + (b.v - a.v) * t;
      }
    }
    return profile[last].v;
  }

  function inkFor(d) {
    var eInk = Math.min(1, d * 1.65);
    return (
      "rgba(" + Math.round(21 + (247 - 21) * eInk) + ", " + Math.round(26 + (243 - 26) * eInk) + ", " +
      Math.round(23 + (234 - 23) * eInk) + ", " + (0.88 + 0.08 * eInk).toFixed(3) + ")"
    );
  }

  function collectInkEls() {
    inkEls = [];
    if (brand) inkEls.push(brand);
    if (links) {
      Array.prototype.forEach.call(links.querySelectorAll("a"), function (a) { inkEls.push(a); });
    }
    if (tools) {
      Array.prototype.forEach.call(tools.querySelectorAll("a,button"), function (el) { inkEls.push(el); });
    }
  }

  function paintIslands() {
    if (!inkEls) collectInkEls();
    var top = 0;
    var centre = 0;
    layers.forEach(function (layer, idx) {
      var r = layer.island.getBoundingClientRect();
      var pts = [];
      for (var i = 0; i < profile.length; i += 1) {
        if (profile[i].x >= r.left - 2 && profile[i].x <= r.right + 2) pts.push(profile[i]);
      }
      if (!pts.length) pts = [{ x: r.left, v: 0 }, { x: r.left + r.width, v: 0 }];
      var shades = [];
      var frost = [];
      var avg = 0;
      for (var j = 0; j < pts.length; j += 1) {
        var p = Math.max(0, Math.min(100, ((pts[j].x - r.left) / Math.max(1, r.width)) * 100));
        var v = pts[j].v;
        avg += v;
        shades.push("rgba(15, 18, 15, " + (0.9 * v).toFixed(3) + ") " + p.toFixed(1) + "%");
        frost.push("rgba(0, 0, 0, " + (1 - v).toFixed(3) + ") " + p.toFixed(1) + "%");
      }
      avg /= pts.length;
      layer.shade.style.backgroundImage = "linear-gradient(90deg, " + shades.join(", ") + ")";
      var mask = "linear-gradient(90deg, " + frost.join(", ") + ")";
      layer.frost.style.webkitMaskImage = mask;
      layer.frost.style.maskImage = mask;
      if (idx === 1) centre = avg;
      top = Math.max(top, avg);
      var eInk = Math.min(1, avg * 1.65);
      layer.island.style.setProperty("--nav-dark", avg.toFixed(3));
      layer.island.style.setProperty("--nav-edge", "rgba(255, 255, 255, " + (0.5 - 0.3 * eInk).toFixed(3) + ")");
      layer.island.style.setProperty("--nav-hover", "rgba(255, 255, 255, " + (0.4 - 0.28 * eInk).toFixed(3) + ")");
      layer.island.style.setProperty("--nav-seal-invert", eInk.toFixed(3));
      layer.island.style.setProperty(
        "--nav-active-bg",
        "rgba(" + Math.round(255 - 8 * eInk) + ", " + Math.round(255 - 12 * eInk) + ", " +
          Math.round(255 - 21 * eInk) + ", " + (0.66 + 0.28 * eInk).toFixed(3) + ")"
      );
    });
    inkEls.forEach(function (el) {
      var box = el.getBoundingClientRect();
      if (!box.width) return;
      /* the active chip always keeps dark ink: its pill is paper-white */
      if (el.classList && el.classList.contains("is-active")) {
        el.style.color = inkFor(0);
        return;
      }
      el.style.color = inkFor(valueAt(box.left + box.width / 2));
    });
    var eTop = Math.min(1, top * 1.65);
    var tr = Math.round(21 + (247 - 21) * eTop);
    var tg = Math.round(26 + (243 - 26) * eTop);
    var tb = Math.round(23 + (234 - 23) * eTop);
    nav.style.setProperty("--nav-dark", top.toFixed(3));
    nav.style.setProperty("--nav-ink", "rgba(" + tr + ", " + tg + ", " + tb + ", " + (0.88 + 0.08 * eTop).toFixed(3) + ")");
    nav.classList.toggle("is-over-dark", top > 0.5);
    return centre;
  }

  function tickDark() {
    darkFrame = 0;
    var busy = false;
    profile.forEach(function (s) {
      s.v += (s.goal - s.v) * 0.16;
      if (Math.abs(s.goal - s.v) < 0.004) s.v = s.goal;
      if (s.v !== s.goal) busy = true;
    });
    paintIslands();
    if (busy) darkFrame = window.requestAnimationFrame(tickDark);
  }

  function scheduleDark() {
    if (darkFrame) return;
    darkFrame = window.requestAnimationFrame(tickDark);
  }

  function detectBackdrop() {
    detectProfile();
  }

  function schedule() {
    if (raf) return;
    raf = window.requestAnimationFrame(update);
  }

  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", function () {
    placeDrop(hoverLink || activeLink);
    schedule();
  });

  inner.addEventListener("pointerenter", function () {
    hovering = true;
    setCondensed(false);
  });
  inner.addEventListener("pointerleave", function () {
    cancelGlow(false);
    hovering = false;
    setCondensed(shouldCondense());
  });
  nav.addEventListener("focusin", function () {
    focusInside = true;
    setCondensed(false);
  });
  nav.addEventListener("focusout", function (e) {
    if (e.relatedTarget && nav.contains(e.relatedTarget)) return;
    focusInside = false;
    setCondensed(shouldCondense());
  });

  /* touch: a tap on the condensed island blooms it open instead of jumping */
  var lastTouch = 0;
  nav.addEventListener("pointerdown", function (e) {
    if (e.pointerType !== "touch") return;
    if (!condensed) return;
    if (e.target.closest && e.target.closest("a,button")) return;
    lastTouch = Date.now();
    setCondensed(false);
  });

  placeDrop(activeLink);
  update();
  window.addEventListener("load", schedule);
  if (window.ResizeObserver) {
    var ro = new ResizeObserver(function () {
      placeDrop(hoverLink || activeLink);
    });
    ro.observe(inner);
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      placeDrop(hoverLink || activeLink);
    });
  }

  /* small escape hatch for debugging / tests */
  window.__navIsland = {
    isCondensed: function () {
      return condensed;
    },
    update: update
  };
})();
