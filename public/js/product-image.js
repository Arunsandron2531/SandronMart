(function () {
  'use strict';

  var ATTACHED_ATTR = 'data-image-fallback-attached';
  var FALLBACK_CLASS = 'image-fallback';

  function revealFallback(img) {
    var el = img;
    while ((el = el.nextElementSibling)) {
      if (el.classList && el.classList.contains(FALLBACK_CLASS)) {
        el.style.display = 'grid';
        return;
      }
    }
  }

  function applyFallback(img) {
    var src = img.getAttribute('src') || '';
    var fallback = img.getAttribute('data-default-image') || '';
    if (!fallback) {
      return;
    }
    if (src.indexOf(fallback) !== -1) {
      img.style.display = 'none';
      revealFallback(img);
    } else {
      img.setAttribute('src', fallback);
    }
  }

  function attach(img) {
    if (img.getAttribute(ATTACHED_ATTR) === '1') {
      return;
    }
    img.setAttribute(ATTACHED_ATTR, '1');
    img.addEventListener('error', function () {
      applyFallback(img);
    });
    if (img.complete && img.naturalWidth === 0) {
      applyFallback(img);
    }
  }

  function init() {
    document.querySelectorAll('img[data-default-image]').forEach(attach);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();