/* ==== diagnostics — Product readiness (honest, based on the real build) ==== */
(function () {
  var READINESS = [
    ['UI & layout', 'ready'],
    ['Responsive design', 'ready'],
    ['Charts & visualisation', 'ready'],
    ['Financial calculations', 'ready'],
    ['AI narratives', 'ready'],
    ['Reports & exports', 'ready'],
    ['Local sign-in (demo)', 'demo'],
    ['Data storage', 'demo'],
    ['Security', 'demo'],
    ['Multi-user & teams', 'backend'],
    ['Subscriptions & billing', 'config'],
    ['Usage limits', 'backend']
  ];
  var LABEL = { ready: 'Ready', demo: 'Demo Only', backend: 'Needs Backend', config: 'Needs Configuration' };
  function render() {
    var grid = document.getElementById('readinessGrid'); if (!grid) return;
    grid.innerHTML = '';
    READINESS.forEach(function (row) {
      var item = document.createElement('div'); item.className = 'r-item';
      var label = document.createElement('span'); label.className = 'r-label'; label.textContent = row[0];
      var pill = document.createElement('span'); pill.className = 'r-pill ' + row[1]; pill.textContent = LABEL[row[1]];
      item.appendChild(label); item.appendChild(pill); grid.appendChild(item);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
