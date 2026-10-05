/* ==== plan & usage — subscription UI + usage meter (honest, server-processed) ==== */
(function () {
  var STORE = 'bizpulse.usage.v1';
  var LIMITS = { free: 20, pro: 200, business: 1000 };
  var PLANS = [
    { id: 'free', name: 'Free', price: '₹0', per: '', features: ['1 business', '20 AI analyses / month', 'Basic dashboard', 'Limited reports'] },
    { id: 'pro', name: 'Pro', price: '₹999', per: '/ month', features: ['Multiple analyses', 'AI CFO + Risk agents', 'Forecasting', 'PDF reports & alerts'] },
    { id: 'business', name: 'Business', price: '₹2,999', per: '/ month', features: ['Multiple businesses', 'Advanced analytics', 'Higher AI limits', 'Team access & priority'] }
  ];
  function $(id) { return document.getElementById(id); }
  function read() {
    var d; try { d = JSON.parse(localStorage.getItem(STORE)); } catch (e) { d = null; }
    var month = new Date().toISOString().slice(0, 7);
    if (!d || d.month !== month) { d = { month: month, ai: 0 }; }
    return d;
  }
  function write(d) { try { localStorage.setItem(STORE, JSON.stringify(d)); } catch (e) {} }
  function currentPlan() { try { return localStorage.getItem('bizpulse.plan.v1') || 'free'; } catch (e) { return 'free'; } }
  function setPlan(p) { try { localStorage.setItem('bizpulse.plan.v1', p); } catch (e) {} }

  function bump(kind) {
    var d = read();
    if (kind === 'ai') d.ai = (d.ai || 0) + 1;
    write(d); render();
  }

  function render() {
    var plan = currentPlan();
    var d = read();
    var limit = LIMITS[plan] || LIMITS.free;
    var used = d.ai || 0;
    var pb = $('planBadge'); if (pb) pb.textContent = PLANS.find(function (p) { return p.id === plan; }).name;
    var ua = $('usageAi'); if (ua) ua.textContent = used + ' / ' + limit;
    var bar = $('usageBar'); if (bar) bar.style.width = Math.min(100, Math.round(used / limit * 100)) + '%';
    var grid = $('planGrid'); if (!grid) return;
    grid.innerHTML = '';
    PLANS.forEach(function (p) {
      var card = document.createElement('div');
      card.className = 'plan-card' + (p.id === plan ? ' current' : '');
      var ul = p.features.map(function (f) { return '<li>' + f + '</li>'; }).join('');
      card.innerHTML = '<h4>' + p.name + '</h4><div class="price">' + p.price + ' <small>' + p.per + '</small></div><ul>' + ul + '</ul>' +
        (p.id === plan ? '<button class="btn ghost" disabled>Current plan</button>' : '<button class="btn primary" data-plan="' + p.id + '">Upgrade</button>');
      var btn = card.querySelector('[data-plan]');
      if (btn) btn.addEventListener('click', function () { upgrade(p.id); });
      grid.appendChild(card);
    });
  }

  async function upgrade(plan) {
    var st = $('planStatus');
    function say(msg, kind) { if (!st) return; st.classList.remove('hidden', 'ok', 'err'); if (kind) st.classList.add(kind); st.textContent = msg; }
    if (!window.BPAuth || !window.BPAuth.isBackendConnected) { say('Upgrades need the secure backend sign-in. Sign in with the backend, then try again.', 'err'); return; }
    say('Creating a secure checkout…');
    try {
      var session = await window.BPAuth.getSession();
      var token = null;
      try { var raw = localStorage.getItem('sb-' + (window.BPAuth && 'auth-token') + ''); } catch (e) {}
      var base = 'https://xxszydatmykvdnslwgoe.supabase.co';
      var res = await fetch(base + '/functions/v1/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan: plan })
      });
      var data = await res.json().catch(function () { return {}; });
      if (res.status === 501) { say(data.error || 'Payments are not configured yet.', 'err'); return; }
      if (!res.ok || !data.ok) { say(data.error || ('Checkout failed (' + res.status + ').'), 'err'); return; }
      say('Checkout ready — complete payment to activate ' + plan + '.', 'ok');
    } catch (e) {
      say('Could not reach the payment service. It needs the backend and payment keys configured.', 'err');
    }
  }

  function bind() {
    ['btnRunAgents', 'btnRunAgents2'].forEach(function (id) { var b = $(id); if (b) b.addEventListener('click', function () { bump('ai'); }); });
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();
})();
