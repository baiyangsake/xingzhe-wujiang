/* Load as a small classic script in <head>, before the first render. */
(function () {
  "use strict";
  if (window.__walkersTransitions) return;
  window.__walkersTransitions = true;
  var doc = document;
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  var assigned = [];
  var clicked = null;
  var generation = 0;

  function url(value) {
    try {
      var result = new URL(value, location.href);
      return result.origin === location.origin ? result : null;
    } catch (_) { return null; }
  }
  function project(value) { return value && /\/project-[^/]+\.html$/.test(value.pathname); }
  function visible(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight &&
      window.getComputedStyle(el).visibility !== "hidden";
  }
  function clear() {
    assigned.forEach(function (entry) { entry.el.style.viewTransitionName = entry.old; });
    assigned = [];
  }
  function name(el, value) {
    if (!el || assigned.some(function (entry) { return entry.el === el; })) return;
    assigned.push({ el: el, old: el.style.viewTransitionName });
    el.style.viewTransitionName = value;
  }
  function prepare(other, transition, outgoing) {
    clear();
    var currentGeneration = ++generation;
    if (!transition) return;
    if (reduced.matches) { transition.skipTransition(); return; }
    var current = url(location.href);
    var title = doc.querySelector("[data-vt-title], .phero__title, .proj-hero__title, .article__title, main h1, h1");
    var cover = null;
    if (project(current) && (!project(other) || other.pathname === current.pathname)) {
      cover = doc.querySelector("[data-vt-cover], .proj-hero__bg img");
    } else if (project(other) && !project(current)) {
      var links = Array.prototype.filter.call(doc.querySelectorAll("a[href]"), function (link) {
        var target = url(link.href);
        return target && target.pathname === other.pathname && link.querySelector("[data-vt-cover], img");
      });
      var link = outgoing && links.indexOf(clicked) >= 0 && visible(clicked) ? clicked : links.filter(visible)[0];
      if (link) {
        var card = link.closest("[data-vt-project], .exp-detail, .prow, .pcard, .index__row") || link;
        cover = link.querySelector("[data-vt-cover], img");
        title = card.querySelector("[data-vt-title], [data-exp-name], .prow__name, .pcard__title, .index__name, h2, h3") || title;
      }
    }
    // Only one title and one active project cover ever receive these names.
    if (visible(title)) name(title, "page-title");
    if (visible(cover)) name(cover, "project-cover");
    var done = outgoing ? transition.finished : transition.ready;
    function cleanThisTransition() { if (generation === currentGeneration) clear(); }
    Promise.resolve(done).then(cleanThisTransition, cleanThisTransition);
  }
  doc.addEventListener("click", function (event) {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    clicked = event.target.closest && event.target.closest("a[href]");
  }, true);
  window.addEventListener("pageswap", function (event) {
    var other = event.activation && event.activation.entry && url(event.activation.entry.url);
    prepare(other, event.viewTransition, true);
  });
  window.addEventListener("pagereveal", function (event) {
    var activation = window.navigation && window.navigation.activation;
    var other = activation && activation.from ? url(activation.from.url) : url(doc.referrer || location.href);
    prepare(other, event.viewTransition, false);
  });
})();
