/* Open a real entry from the historical archive. */
(function () {
  'use strict';
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
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initRandomReading, { once: true });
  else initRandomReading();
})();
