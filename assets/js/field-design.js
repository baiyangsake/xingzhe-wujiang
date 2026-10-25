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
