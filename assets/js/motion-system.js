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
            else if (animations.has(entry.target)) stopReveal(entry.target);
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
