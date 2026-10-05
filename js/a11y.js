/* ==== a11y — small, safe accessibility enhancements ==== */
(function () {
  function ready(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
  ready(function () {
    var nav = document.querySelector('.nav');
    if (nav) { nav.setAttribute('role', 'navigation'); nav.setAttribute('aria-label', 'Main'); }
    var main = document.querySelector('main');
    if (main) main.setAttribute('role', 'main');
    document.querySelectorAll('.nav-btn').forEach(function (b) {
      if (!b.getAttribute('aria-label')) b.setAttribute('aria-label', b.textContent.trim().replace(/\s+\d+$/, ''));
      b.addEventListener('click', function () {
        document.querySelectorAll('.nav-btn').forEach(function (x) { x.removeAttribute('aria-current'); });
        b.setAttribute('aria-current', 'page');
      });
    });
    var toast = document.getElementById('toast'); if (toast) { toast.setAttribute('role', 'status'); toast.setAttribute('aria-live', 'polite'); }
    var as = document.getElementById('authStatus'); if (as) as.setAttribute('aria-live', 'polite');
    document.querySelectorAll('.icon-btn').forEach(function (b) {
      if (!b.getAttribute('aria-label')) b.setAttribute('aria-label', b.getAttribute('title') || 'Button');
    });
  });
})();
