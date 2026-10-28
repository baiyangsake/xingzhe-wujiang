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
