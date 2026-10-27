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
      if (event.key === "ArrowRight") { event.preventDefault(); goTo(current() + 1); }
      else if (event.key === "ArrowLeft") { event.preventDefault(); goTo(current() - 1); }
      else if (event.key === "Home") { event.preventDefault(); goTo(0); }
      else if (event.key === "End") { event.preventDefault(); goTo(count - 1); }
    });

    rail.addEventListener("pointerdown", function (event) {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      dragging = true;
      dragStartX = event.clientX;
      dragStartScroll = rail.scrollLeft;
      rail.classList.add("is-dragging");
    });
    window.addEventListener("pointermove", function (event) {
      if (!dragging) return;
      var dx = event.clientX - dragStartX;
      if (Math.abs(dx) > 4) {
        suppressClick = true;
        rail.scrollLeft = dragStartScroll - dx;
      }
    });
    window.addEventListener("pointerup", function () {
      if (!dragging) return;
      dragging = false;
      rail.classList.remove("is-dragging");
      window.setTimeout(function () { suppressClick = false; }, 0);
      goTo(current());
    });
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
