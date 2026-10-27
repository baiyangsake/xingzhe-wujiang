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

  function detectBackdrop() {
    var now = Date.now();
    if (now - lastDetect < 120) return;
    lastDetect = now;
    /* Each island is sampled on its own and fades on its own, so a bar that
       spans paper and a photograph turns dark only where the picture is. */
    layers.forEach(function (layer) {
      var island = layer.island;
      var r = island.getBoundingClientRect();
      if (!r.width || r.bottom < 0 || r.top > window.innerHeight) {
        layer.goal = 0;
        return;
      }
      var y = r.top + r.height * 0.55;
      var xs = [
        r.left + r.width * 0.24,
        r.left + r.width * 0.5,
        r.left + r.width * 0.76
      ];
      var hits = 0;
      for (var j = 0; j < xs.length; j += 1) {
        if (backdropProbe(Math.round(xs[j]), Math.round(y))) hits += 1;
      }
      layer.goal = Math.min(1, (hits / xs.length) * 1.35);
    });
    scheduleDark();
  }

  function paintLayer(layer) {
    var t = layer.dark;
    var eInk = Math.min(1, t * 1.65);
    var r = Math.round(21 + (247 - 21) * eInk);
    var g = Math.round(26 + (243 - 26) * eInk);
    var b = Math.round(23 + (234 - 23) * eInk);
    var island = layer.island;
    island.style.setProperty("--nav-dark", t.toFixed(3));
    island.style.setProperty(
      "--nav-ink",
      "rgba(" + r + ", " + g + ", " + b + ", " + (0.88 + 0.08 * eInk).toFixed(3) + ")"
    );
    island.style.setProperty("--nav-edge", "rgba(255, 255, 255, " + (0.5 - 0.30 * eInk).toFixed(3) + ")");
    island.style.setProperty("--nav-hover", "rgba(255, 255, 255, " + (0.4 - 0.28 * eInk).toFixed(3) + ")");
    island.style.setProperty(
      "--nav-active-bg",
      "rgba(" + Math.round(255 - 8 * eInk) + ", " + Math.round(255 - 12 * eInk) + ", " +
        Math.round(255 - 21 * eInk) + ", " + (0.66 + 0.28 * eInk).toFixed(3) + ")"
    );
    island.style.setProperty("--nav-seal-invert", eInk.toFixed(3));
  }

  function paintRoot() {
    var centre = layers.length > 1 ? layers[1].dark : 0;
    var top = layers.reduce(function (m, layer) { return Math.max(m, layer.dark); }, 0);
    var eInk = Math.min(1, centre * 1.65);
    var r = Math.round(21 + (247 - 21) * eInk);
    var g = Math.round(26 + (243 - 26) * eInk);
    var b = Math.round(23 + (234 - 23) * eInk);
    nav.style.setProperty("--nav-dark", top.toFixed(3));
    nav.style.setProperty(
      "--nav-ink",
      "rgba(" + r + ", " + g + ", " + b + ", " + (0.88 + 0.08 * eInk).toFixed(3) + ")"
    );
    nav.style.setProperty("--nav-edge", "rgba(255, 255, 255, " + (0.5 - 0.30 * eInk).toFixed(3) + ")");
    nav.style.setProperty("--nav-hover", "rgba(255, 255, 255, " + (0.4 - 0.28 * eInk).toFixed(3) + ")");
    nav.style.setProperty(
      "--nav-active-bg",
      "rgba(" + Math.round(255 - 8 * eInk) + ", " + Math.round(255 - 12 * eInk) + ", " +
        Math.round(255 - 21 * eInk) + ", " + (0.66 + 0.28 * eInk).toFixed(3) + ")"
    );
    nav.style.setProperty("--nav-seal-invert", eInk.toFixed(3));
    nav.classList.toggle("is-over-dark", top > 0.5);
  }

  function tickDark() {
    darkFrame = 0;
    var busy = false;
    layers.forEach(function (layer) {
      layer.dark += (layer.goal - layer.dark) * 0.14;
      if (Math.abs(layer.goal - layer.dark) < 0.004) layer.dark = layer.goal;
      paintLayer(layer);
      if (layer.dark !== layer.goal) busy = true;
    });
    paintRoot();
    if (busy) darkFrame = window.requestAnimationFrame(tickDark);
  }

  function scheduleDark() {
    if (darkFrame) return;
    darkFrame = window.requestAnimationFrame(tickDark);
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
