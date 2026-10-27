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
