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
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
    links.addEventListener("focusout", function () {
      placeDrop(hoverLink || activeLink);
    });
  }

  var glowX = 0;
  var glowY = 0;
  var glowRaf = 0;
  inner.addEventListener("pointermove", function (e) {
    var r = inner.getBoundingClientRect();
    glowX = e.clientX - r.left;
    glowY = e.clientY - r.top;
    if (glowRaf) return;
    glowRaf = window.requestAnimationFrame(function () {
      glowRaf = 0;
      inner.style.setProperty("--island-x", glowX + "px");
      inner.style.setProperty("--island-y", glowY + "px");
      inner.style.setProperty("--island-glow", Math.max(120, Math.min(260, r.width * 0.35)) + "px");
    });
  });

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

  function detectBackdrop() {
    var now = Date.now();
    if (now - lastDetect < 120) return;
    lastDetect = now;
    var r = inner.getBoundingClientRect();
    if (!r.width || r.bottom < 0) {
      nav.classList.remove("is-over-dark");
      return;
    }
    var y = Math.min(window.innerHeight - 1, Math.max(1, r.top + r.height * 0.55));
    var xs = [
      r.left + r.width * 0.22,
      r.left + r.width * 0.5,
      r.left + r.width * 0.78
    ];
    var dark = 0;
    for (var i = 0; i < xs.length; i += 1) {
      if (backdropProbe(Math.round(xs[i]), Math.round(y))) dark += 1;
    }
    nav.classList.toggle("is-over-dark", dark >= 2);
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
    hovering = false;
    setCondensed(shouldCondense());
  });
  nav.addEventListener("focusin", function () {
    focusInside = true;
    setCondensed(false);
  });
  nav.addEventListener("focusout", function () {
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
