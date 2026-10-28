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
  var lists = document.querySelectorAll(".exp-tabs");
  if (!lists.length) return;
  var fine = window.matchMedia("(hover: hover) and (pointer: fine)");
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  function bind(list) {
    var wrap = list.closest(".field-atlas__tabs") || list;

    list.addEventListener("pointermove", function (event) {
      if (event.pointerType && event.pointerType !== "mouse") return;
      if (!fine.matches || reduced.matches) return;
      var box = wrap.getBoundingClientRect();
      wrap.style.setProperty("--gx", (event.clientX - box.left).toFixed(1) + "px");
      wrap.style.setProperty("--gy", (event.clientY - box.top).toFixed(1) + "px");
      wrap.classList.add("is-lit");
    }, { passive: true });

    list.addEventListener("pointerleave", function () {
      wrap.classList.remove("is-lit");
    });
    list.addEventListener("scroll", function () {
      wrap.classList.remove("is-lit");
    }, { passive: true });
  }

  Array.prototype.forEach.call(lists, bind);
})();
