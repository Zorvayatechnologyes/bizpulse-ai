/* ==== alerts — Smart Alerts centre (deterministic, from the metrics engine) ==== */
(function () {
  var STORE = 'bizpulse.alerts.v1';
  var showDismissed = false;
  function read() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; } }
  function write(o) { try { localStorage.setItem(STORE, JSON.stringify(o)); } catch (e) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]; }); }
  function pct(v) { return (v * 100).toFixed(1) + '%'; }
  var SEV = { critical: 'critical', watch: 'watch', good: 'good', info: 'info' };
  var ICON = { critical: '!', watch: '!', good: '+', info: 'i' };

  function build(m) {
    var out = [];
    if (!m || m.empty) return out;
    var rows = m.months, last = rows[rows.length - 1], prev = rows[rows.length - 2];
    var b = m.burn || {};
    if (b.profitable) {
      out.push({ key: 'runway:ok', sev: 'good', title: 'Cash-flow positive', reason: 'Revenue covers expenses, so the business is not burning cash.', metric: 'Net burn', action: 'Keep an eye on expenses as you grow.', agent: 'cfo' });
    } else if (b.runwayMonths != null && isFinite(b.runwayMonths)) {
      if (b.runwayMonths < 3) out.push({ key: 'runway:crit', sev: 'critical', title: 'Cash runway below 3 months', reason: 'At the current burn you have about ' + b.runwayMonths.toFixed(1) + ' months of cash left.', metric: 'Runway', action: 'Cut discretionary spend and speed up collections this week.', agent: 'cfo' });
      else if (b.runwayMonths < 6) out.push({ key: 'runway:warn', sev: 'watch', title: 'Cash runway under 6 months', reason: 'Runway is about ' + b.runwayMonths.toFixed(1) + ' months.', metric: 'Runway', action: 'Plan a cost review and consider extending credit.', agent: 'cfo' });
    }
    if (last && last.revenueGrowth != null) {
      if (last.revenueGrowth <= -0.10) out.push({ key: 'rev:down:' + last.label, sev: 'critical', title: 'Revenue dropped ' + pct(Math.abs(last.revenueGrowth)), reason: 'Revenue fell versus the previous month.', metric: 'Revenue', action: 'Find which products or customers dropped and act on the top ones.', agent: 'growth' });
      else if (last.revenueGrowth <= -0.02) out.push({ key: 'rev:soft:' + last.label, sev: 'watch', title: 'Revenue slipped ' + pct(Math.abs(last.revenueGrowth)), reason: 'A small month-on-month decline.', metric: 'Revenue', action: 'Check seasonality and pipeline before reacting.', agent: 'growth' });
      else if (last.revenueGrowth >= 0.05) out.push({ key: 'rev:up:' + last.label, sev: 'good', title: 'Revenue grew ' + pct(last.revenueGrowth), reason: 'Momentum is positive month on month.', metric: 'Revenue', action: 'Reinforce what is working and keep the pipeline full.', agent: 'growth' });
    }
    if (last && prev && prev.expenses > 0) {
      var eg = (last.expenses - prev.expenses) / prev.expenses;
      if (eg >= 0.20) out.push({ key: 'exp:spike:' + last.label, sev: 'watch', title: 'Expenses jumped ' + pct(eg), reason: 'Spending rose sharply versus the previous month.', metric: 'Expenses', action: 'Review the biggest expense lines for one-off or avoidable items.', agent: 'ops' });
    }
    var nm = m.avg ? m.avg.netMargin : null;
    if (nm != null) {
      if (nm < 0) out.push({ key: 'margin:loss', sev: 'critical', title: 'Operating at a loss', reason: 'Average net margin is ' + pct(nm) + ' — expenses exceed revenue.', metric: 'Net margin', action: 'Prioritise the largest cost categories and review pricing.', agent: 'cfo' });
      else if (nm < 0.05) out.push({ key: 'margin:thin', sev: 'watch', title: 'Thin net margin', reason: 'Average net margin is only ' + pct(nm) + '.', metric: 'Net margin', action: 'Look for pricing and cost-efficiency gains.', agent: 'cfo' });
    }
    var eb = m.expenseBreakdown || [];
    if (eb.length && eb[0].share >= 0.4) out.push({ key: 'conc:exp', sev: 'info', title: eb[0].name + ' is ' + pct(eb[0].share) + ' of spend', reason: 'One cost line dominates your expenses.', metric: 'Expense mix', action: 'Even a small reduction here moves profit noticeably.', agent: 'ops' });
    var hs = m.health ? m.health.score : null;
    if (hs != null) {
      if (hs >= 65) out.push({ key: 'health:good', sev: 'good', title: 'Business health is strong', reason: 'Overall health score is ' + hs + '/100 (grade ' + (m.health.grade || '—') + ').', metric: 'Health score', action: 'Keep doing what you are doing; review monthly.', agent: 'cfo' });
      else if (hs < 45) out.push({ key: 'health:low', sev: 'watch', title: 'Business health needs attention', reason: 'Overall health score is ' + hs + '/100 (grade ' + (m.health.grade || '—') + ').', metric: 'Health score', action: 'Work through the lowest-scoring categories first.', agent: 'cfo' });
    }
    return out;
  }

  function metrics() { return window.__bpMetrics || null; }

  function statusOf(store, key) { return store[key] || 'unread'; }

  function refreshBadge() {
    var badge = document.getElementById('alertsBadge'); if (!badge) return;
    var m = metrics(); var store = read();
    var alerts = build(m).filter(function (a) { return statusOf(store, a.key) !== 'dismissed'; });
    var unread = alerts.filter(function (a) { return statusOf(store, a.key) === 'unread'; }).length;
    badge.textContent = String(unread);
    badge.classList.toggle('hidden', unread === 0);
  }

  function setStatus(key, st) { var s = read(); s[key] = st; write(s); render(); }

  function render() {
    var list = document.getElementById('alertsList'); if (!list) return;
    var m = metrics();
    if (!m || m.empty) { list.innerHTML = '<div class="alert-empty">No data yet — add or import your numbers and alerts will appear here.</div>'; refreshBadge(); return; }
    var store = read();
    var alerts = build(m).filter(function (a) { return showDismissed || statusOf(store, a.key) !== 'dismissed'; });
    if (!alerts.length) { list.innerHTML = '<div class="alert-empty">Nothing to flag right now — your numbers look steady.</div>'; refreshBadge(); return; }
    list.innerHTML = '';
    alerts.forEach(function (a) {
      var st = statusOf(store, a.key);
      var card = document.createElement('div');
      card.className = 'alert-card sev-' + a.sev + (st === 'read' ? ' is-read' : '') + (st === 'resolved' ? ' is-resolved' : '');
      card.innerHTML =
        '<div class="alert-ico" aria-hidden="true">' + esc(ICON[a.sev] || 'i') + '</div>' +
        '<div class="alert-main">' +
          '<div class="alert-top"><span class="alert-title">' + esc(a.title) + '</span>' +
            '<span class="sev-pill ' + (a.sev === 'critical' ? 'critical' : a.sev === 'watch' ? 'watch' : a.sev === 'good' ? 'good' : 'info') + '">' + esc(a.sev) + '</span>' +
            (st === 'resolved' ? '<span class="sev-pill good">resolved</span>' : st === 'read' ? '<span class="sev-pill info">read</span>' : '') +
          '</div>' +
          '<div class="alert-reason">' + esc(a.reason) + '</div>' +
          '<div class="alert-action"><b>Recommended action · </b>' + esc(a.action) + '</div>' +
          '<div class="alert-meta"><span class="chip">' + esc(a.metric) + '</span><span class="chip">Agent: ' + esc(a.agent.toUpperCase()) + '</span></div>' +
          '<div class="alert-btns">' +
            (st === 'unread' ? '<button class="btn ghost" data-act="read">Mark read</button>' : '') +
            (st !== 'resolved' ? '<button class="btn ghost" data-act="resolved">Resolve</button>' : '') +
            '<button class="btn ghost" data-act="open">Open analysis</button>' +
            (st !== 'dismissed' ? '<button class="btn danger ghost" data-act="dismissed">Dismiss</button>' : '<button class="btn ghost" data-act="unread">Restore</button>') +
          '</div>' +
        '</div>';
      card.querySelectorAll('[data-act]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var act = btn.getAttribute('data-act');
          if (act === 'open') { if (window.BPShowView) window.BPShowView('agents'); return; }
          setStatus(a.key, act);
        });
      });
      list.appendChild(card);
    });
    refreshBadge();
  }

  function bind() {
    var sd = document.getElementById('alertsShowDismissed');
    if (sd) sd.addEventListener('click', function () { showDismissed = !showDismissed; sd.textContent = showDismissed ? 'Hide dismissed' : 'Show dismissed'; render(); });
    var ma = document.getElementById('alertsMarkAll');
    if (ma) ma.addEventListener('click', function () {
      var store = read(); build(metrics()).forEach(function (a) { if (!store[a.key] || store[a.key] === 'unread') store[a.key] = 'read'; }); write(store); render();
    });
  }

  window.BPAlerts = { render: render, refreshBadge: refreshBadge };
  function init() { bind(); refreshBadge(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
