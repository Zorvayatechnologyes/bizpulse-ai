/* ============================================================
   BizPulse AI — app controller
   Wires the UI: navigation, data entry, upload, agents, report,
   settings, persistence. Uses BPData, BPEngine, BPAgents, BPLLM,
   BPCharts.
   ============================================================ */
(function () {
  const D = window.BPData;
  const E = window.BPEngine;
  const A = window.BPAgents;
  const L = window.BPLLM;

  /* ---------- app state ---------- */
  let state = D.emptyState();
  let settings = { currency: 'INR', compact: true, llm: { provider: 'openai', model: '', apiKey: '', baseUrl: '' } };
  let metrics = null;
  let agentResults = null;
  let liveNarratives = {};       // agentId -> {text, live}
  let selectedMonthId = null;
  let lastMapping = null;
  let running = false;

  /* ---------- tiny helpers ---------- */
  function el(id) { return document.getElementById(id); }
  function h(tag, attrs, children) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else if (k.startsWith('on') && typeof attrs[k] === 'function') n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(c => n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return n;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function money(v) { return D.formatMoney(v, state.business.currency, settings.compact ? 'compact' : 'full'); }
  function pct(v) { return D.formatPct(v); }
  function toast(msg) {
    const t = el('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2600);
  }
  function debounce(fn, ms) { let t; return function () { clearTimeout(t); const a = arguments; t = setTimeout(() => fn.apply(null, a), ms); }; }

  function kIcon(name) {
    const p = {
      trend: '<path d="M3 17l5-5 3.5 3.5L21 7"/><path d="M15 7h6v6"/>',
      percent: '<path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.2"/><circle cx="17" cy="17" r="2.2"/>',
      flame: '<path d="M12 22c4 0 6.5-2.6 6.5-6 0-3-2-5.2-3.2-7.2C14.1 6.6 13.5 5 13.5 3c-2.2 2-3.5 4.2-3.5 6.2 0 1 .4 2 .4 2S9 9.6 9 7.6C7.4 9.6 6 12 6 16c0 3.4 2.4 6 6 6z"/>',
      clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>',
      card: '<rect x="3" y="6" width="18" height="12" rx="2.5"/><path d="M3 10.5h18"/>',
      activity: '<path d="M22 12h-4l-2.5 7L9 5l-2.5 7H2"/>'
    };
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (p[name] || '') + '</svg>';
  }

  function sparkline(vals, color) {
    if (!vals || vals.length < 2) return '';
    const w = 120, h = 30, pad = 5;
    const min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    const range = (max - min) || 1;
    const step = (w - pad * 2) / (vals.length - 1);
    const pts = vals.map((v, i) => [pad + i * step, h - pad - ((v - min) / range) * (h - pad * 2)]);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const area = line + ' L' + (pad + (vals.length - 1) * step).toFixed(1) + ' ' + (h - pad) + ' L' + pad + ' ' + (h - pad) + ' Z';
    const id = 'sg' + Math.random().toString(36).slice(2, 8);
    return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' +
      '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="' + color + '" stop-opacity=".30"/>' +
      '<stop offset="100%" stop-color="' + color + '" stop-opacity=".05"/></linearGradient></defs>' +
      '<path d="' + area + '" fill="url(#' + id + ')"/>' +
      '<path d="' + line + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>' +
      '</svg>';
  }

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '';
    return parts.slice(0, 2).map(p => p[0].toUpperCase()).join('');
  }

  function toggleMenu(force) {
    const s = document.querySelector('.sidebar'); if (!s) return;
    const open = force === undefined ? !s.classList.contains('open') : force;
    s.classList.toggle('open', open);
    const bd = document.getElementById('backdrop');
    if (bd) bd.classList.toggle('show', open);
  }
  function closeMenu() { toggleMenu(false); }

  /* ---------- persistence ---------- */
  function persist() { D.save(state); D.saveSettings(settings); }
  const persistSoon = debounce(persist, 350);

  /* ---------- bootstrap ---------- */
  function init() {
    const params = new URLSearchParams(location.search);
    const demoKey = params.get('demo');
    if (demoKey && D.sampleList().some(x => x.key === demoKey)) {
      state = D.sampleState(demoKey);
    } else {
      const loaded = D.load();
      if (loaded) state = loaded;
    }
    const s = D.loadSettings();
    if (s) settings = Object.assign(settings, s, { llm: Object.assign(settings.llm, s.llm || {}) });
    if (state.business.currency) settings.currency = state.business.currency;

    if (!document.getElementById('backdrop')) {
      const bd = document.createElement('div'); bd.id = 'backdrop'; bd.className = 'backdrop';
      document.body.appendChild(bd);
    }
    bindNav();
    bindDataView();
    bindAgentsView();
    bindReportView();
    bindSettingsView();
    syncSettingsForm();
    updateAiBadge();

    recompute();
    const v = params.get('view');
    const valid = ['dashboard', 'data', 'agents', 'report', 'settings'];
    showView(v && valid.indexOf(v) !== -1 ? v : 'dashboard');
  }

  function recompute() {
    metrics = E.compute(state);
    agentResults = A.run(metrics);
    liveNarratives = {};
    if (!metrics.empty) {
      renderKPIs(); renderHero(); renderAgentGridPreview(); renderCharts(); renderReport();
      if (el('view-agents').classList.contains('active')) renderAgentList();
    }
    toggleEmpty();
    persistSoon();
  }

  function toggleEmpty() {
    const has = state.months.length > 0;
    el('emptyState').classList.toggle('hidden', has);
    el('dashContent').classList.toggle('hidden', !has);
  }

  /* ================= NAV ================= */
  function bindNav() {
    document.querySelectorAll('[data-nav]').forEach(b => {
      b.addEventListener('click', () => showView(b.getAttribute('data-nav')));
    });
    el('mainNav').addEventListener('click', e => {
      const b = e.target.closest('.nav-btn'); if (!b) return;
      showView(b.getAttribute('data-nav'));
    });
    const mb = el('menuBtn');
    if (mb) mb.addEventListener('click', () => toggleMenu());
    const bd = document.getElementById('backdrop');
    if (bd) bd.addEventListener('click', () => toggleMenu(false));
  }
  function showView(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-nav') === name));
    const titles = { dashboard: 'Overview', data: 'Business data', agents: 'AI agents', report: 'Report', settings: 'Settings' };
    const tt = el('topTitle'); if (tt) tt.textContent = titles[name] || 'Overview';
    closeMenu();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (name === 'dashboard' && metrics && !metrics.empty) setTimeout(() => renderCharts(), 30);
    if (name === 'agents' && agentResults && agentResults.specialists.length) renderAgentList();
    if (name === 'report') renderReport();
    if (name === 'data') { renderMonthList(); renderEditor(); }
  }

  /* ================= DASHBOARD ================= */
  function renderKPIs() {
    const m = metrics; const strip = el('kpiStrip'); strip.innerHTML = '';
    const trendCls = t => t === 'up' ? 'trend-up' : t === 'down' ? 'trend-down' : 'trend-flat';
    const trendArrow = t => t === 'up' ? '▲' : t === 'down' ? '▼' : '■';

    const TONE = { 'tone-good': '#4F9077', 'tone-watch': '#A87A2E', 'tone-crit': '#B96E6E', '': '#7FA8A8' };
    const runningProfit = (() => { let s = 0; return m.months.map(r => (s += r.netProfit)); })();
    const items = [
      { icon: 'trend', tile: '#BDD7D8', tone: m.trend.revenue === 'up' ? 'tone-good' : m.trend.revenue === 'down' ? 'tone-crit' : '', spark: m.months.map(r => r.revenue), label: 'Revenue / month', value: money(m.avg.revenue), sub: 'latest ' + money(m.growth.lastRevenue), info: 'Average monthly revenue across the period.' },
      { icon: 'percent', tile: '#D5E5E5', tone: m.avg.netMargin >= 0.1 ? 'tone-good' : m.avg.netMargin >= 0 ? 'tone-watch' : 'tone-crit', spark: m.months.map(r => r.netMargin), label: 'Net profit rate', value: pct(m.avg.netMargin), sub: 'avg profit ' + money(m.avg.netProfit), cls: m.avg.netMargin >= 0 ? 'trend-up' : 'trend-down', info: 'Net profit ÷ revenue, averaged. (revenue − all expenses) ÷ revenue.' },
      { icon: 'flame', tile: '#F7CBCA', tone: m.burn.profitable ? 'tone-good' : 'tone-crit', spark: m.months.map(r => r.netBurn), label: 'Net burn / month', value: m.burn.profitable ? 'Positive' : money(m.burn.netBurn), sub: m.burn.profitable ? 'cash-flow positive' : 'spend − revenue', cls: m.burn.profitable ? 'trend-up' : 'trend-down', info: 'Monthly expenses minus monthly revenue, 3-month average. Positive = burning cash.' },
      { icon: 'clock', tile: '#DDD3D3', tone: m.burn.profitable || m.burn.runwayMonths >= 12 ? 'tone-good' : m.burn.runwayMonths >= 6 ? 'tone-watch' : 'tone-crit', spark: m.months.map(r => r.cumulativeCash), label: 'Runway', value: m.burn.profitable ? 'Unlimited' : D.formatMonths(m.burn.runwayMonths), sub: 'cash ' + money(m.cash.cashOnHand), info: 'Cash on hand ÷ net monthly burn. Unlimited means the business is not burning cash.' },
      { icon: 'card', tile: '#C9D8D8', tone: '', spark: m.months.map(r => r.cumulativeCash), label: 'Cash position', value: money(m.cash.end), sub: 'low ' + money(m.cash.lowest), info: 'Closing cash balance and the lowest point reached.' },
      { icon: 'activity', tile: '#5D6B6B', dark: true, tone: m.health.score >= 65 ? 'tone-good' : m.health.score >= 45 ? 'tone-watch' : 'tone-crit', spark: runningProfit, label: 'Health score', value: String(m.health.score) + '/100', sub: 'Grade ' + m.health.grade, cls: m.health.score >= 65 ? 'trend-up' : m.health.score >= 45 ? 'trend-flat' : 'trend-down', info: 'Weighted score across profitability, liquidity, growth, cost control and stability.' }
    ];
    items.forEach(it => {
      strip.appendChild(h('div', { class: 'kpi' }, [
        h('div', { class: 'kpi-top' }, [
          h('span', { class: 'k-icon' + (it.dark ? ' dark' : ''), style: 'background:' + it.tile, html: kIcon(it.icon) }),
          h('span', { class: 'k-info', title: it.info }, ['i'])
        ]),
        h('div', { class: 'k-label' }, [it.label]),
        h('div', { class: 'k-value ' + (it.cls || '') }, [it.value]),
        h('div', { class: 'k-sub' }, [it.sub]),
        h('div', { class: 'k-spark', html: sparkline(it.spark, TONE[it.tone || ''] || '#7FA8A8') })
      ]));
    });
    el('dashTitle').textContent = state.business.name ? state.business.name + ' — overview' : 'Business overview';
    const tbn = el('topBizName'); if (tbn) tbn.textContent = state.business.name || 'Your business';
    const av = el('topAvatar'); if (av) av.textContent = initials(state.business.name) || 'BP';
    el('dashSubtitle').textContent = m.n + ' months · ' + m.first.pretty + ' → ' + m.last.pretty;
    el('chartHintRev').textContent = 'peak ' + money(Math.max.apply(null, m.months.map(r => r.revenue)));
    el('chartHintBurn').textContent = m.burn.profitable ? 'cash-flow positive' : 'runway ' + D.formatMonths(m.burn.runwayMonths);
  }

  function renderHero() {
    const o = agentResults.orchestrator;
    const box = el('orchestratorPanel'); box.innerHTML = '';
    const sevLabel = o.severity === 'critical' ? 'Needs attention' : o.severity === 'watch' ? 'Watch closely' : 'Healthy';
    const narr = liveNarratives['cfo'] ? liveNarratives['cfo'].text : o.narrative;
    const ringColor = o.score >= 80 ? '#A9D8C2' : o.score >= 65 ? '#BDD7D8' : o.score >= 50 ? '#E3D3A8' : '#E8B4B4';
    const CIRC = 2 * Math.PI * 42;
    const dashOff = CIRC * (1 - Math.max(0, Math.min(100, o.score)) / 100);
    const ringHtml =
      '<svg class="ring" viewBox="0 0 100 100">' +
        '<circle class="ring-track" cx="50" cy="50" r="42"></circle>' +
        '<circle class="ring-fill" cx="50" cy="50" r="42" stroke="' + ringColor + '" style="stroke-dasharray:' + CIRC.toFixed(1) + ';stroke-dashoffset:' + dashOff.toFixed(1) + '"></circle>' +
      '</svg>' +
      '<div class="ring-label"><span class="score-num">' + o.score + '</span><span class="score-lbl">Grade ' + o.grade + '</span></div>';
    box.appendChild(h('div', { class: 'hero-top' }, [
      h('div', { class: 'hero-main' }, [
        h('div', { class: 'hero-role' }, ['CFO Orchestrator · lead agent · ' + sevLabel]),
        h('h2', {}, ['Executive summary']),
        h('p', { html: esc(narr).replace(/\n/g, '<br>') }),
        h('div', { class: 'hero-actions' }, [
          h('button', { class: 'btn ghost', onclick: () => showView('agents') }, ['See all agents']),
          h('button', { class: 'btn ghost', onclick: () => showView('report') }, ['Open report'])
        ])
      ]),
      h('div', { class: 'score-ring', html: ringHtml })
    ]));
    const ol = h('ol', {}, o.priorities.map(p => h('li', {}, [p.text])));
    box.appendChild(h('div', { class: 'priority' }, [h('h4', {}, ['Prioritised actions']), ol]));
    if (o.components && o.components.length) {
      box.appendChild(h('div', { class: 'hero-comps' }, o.components.map(c => h('div', { class: 'hcomp' }, [
        h('div', { class: 'hcomp-top' }, [h('span', {}, [c.label]), h('b', {}, [String(c.score)])]),
        h('div', { class: 'hcomp-track' }, [h('div', { class: 'hcomp-fill', style: 'width:' + c.score + '%' })])
      ]))));
    }
  }

  function renderAgentGridPreview() {
    const grid = el('agentGridPreview'); grid.innerHTML = '';
    agentResults.specialists.forEach(a => {
      grid.appendChild(agentCard(a));
    });
  }

  function agentCard(a) {
    const top = a.findings && a.findings[0];
    return h('div', { class: 'agent-card sev-' + a.severity, onclick: () => { showView('agents'); setTimeout(() => openAgent(a.id), 60); } }, [
      h('div', { class: 'agent-head' }, [
        h('div', { class: 'agent-avatar' + (a.isOrchestrator ? ' dark' : ''), style: 'background:' + a.color }, [a.icon]),
        h('div', {}, [h('div', { class: 'agent-name' }, [a.name]), h('div', { class: 'agent-role' }, [a.role])])
      ]),
      h('p', { class: 'agent-summary' }, [a.blurb]),
      h('div', { class: 'agent-top-find' }, [
        h('span', { class: 'sev-pill ' + a.severity }, [a.severity]),
        h('span', { style: 'margin-left:8px' }, [top ? top.title + (top.num ? ' · ' + top.num : '') : ''])
      ])
    ]);
  }

  function renderCharts() { window.BPCharts.render(metrics, settings); }

  /* ================= AGENTS VIEW ================= */
  function bindAgentsView() {
    el('btnRunAgents').addEventListener('click', runAgents);
    const b2 = el('btnRunAgents2'); if (b2) b2.addEventListener('click', runAgents);
    el('askBtn').addEventListener('click', doAsk);
    el('askInput').addEventListener('keydown', e => { if (e.key === 'Enter') doAsk(); });
    renderAskSuggest();
  }

  function renderAskSuggest() {
    const box = el('askSuggest'); box.innerHTML = '';
    const qs = ['How much runway do I have?', 'Where can I cut costs?', 'Is my profit rate healthy?', 'What is my biggest risk?', 'How is revenue trending?'];
    qs.forEach(q => box.appendChild(h('span', { class: 'chip', onclick: () => { el('askInput').value = q; doAsk(); } }, [q])));
  }

  function renderAgentList() {
    const list = el('agentList'); list.innerHTML = '';
    if (!agentResults || !agentResults.specialists.length) { list.appendChild(h('p', { class: 'muted' }, ['Add some data first to run the agents.'])); return; }
    agentResults.specialists.forEach(a => list.appendChild(agentRow(a)));
    list.appendChild(agentRow(agentResults.orchestrator, true));
  }

  function agentRow(a, isOrch) {
    const narr = liveNarratives[a.id] ? liveNarratives[a.id].text : a.narrative;
    const live = !!(liveNarratives[a.id] && liveNarratives[a.id].live);
    const body = h('div', { class: 'agent-row-body' }, [
      h('h4', {}, ['Analysis' + (live ? ' · live AI' : '')]),
      h('div', { class: 'narrative' + (live ? ' live' : ''), id: 'narr-' + a.id, html: esc(narr).replace(/\n/g, '<br>') }),
      h('h4', {}, ['Findings']),
      h('div', {}, a.findings.map(f => h('div', { class: 'finding' }, [
        h('span', { class: 'sev-pill ' + f.severity }, [f.severity]),
        h('div', { class: 'f-body' }, [
          h('div', { class: 'f-title' }, [f.title + (f.num ? ' — ' : '') + (f.num ? '' : ''), h('span', { class: 'f-num' }, [f.num ? f.num : ''])]),
          h('div', { class: 'f-detail' }, [f.detail || ''])
        ])
      ]))),
      h('h4', {}, ['Recommendations']),
      h('ul', { class: 'rec-list' }, a.recommendations.map(r => h('li', {}, [r]))),
      h('div', { class: 'metric-chips' }, (a.chips || []).map(c => h('span', { class: 'chip' }, [c.label + ': ', h('b', {}, [c.value])])))
    ]);
    const head = h('div', { class: 'agent-row-head' }, [
      h('div', { class: 'agent-avatar' + (a.isOrchestrator ? ' dark' : ''), style: 'background:' + a.color }, [a.icon]),
      h('div', { style: 'flex:1' }, [
        h('div', { class: 'agent-name' }, [a.name + (isOrch ? ' (lead)' : '')]),
        h('div', { class: 'agent-role' }, [a.role])
      ]),
      h('span', { class: 'sev-pill ' + a.severity }, [a.severity]),
      h('span', { class: 'chev' }, ['›'])
    ]);
    const row = h('div', { class: 'agent-row', id: 'agentrow-' + a.id }, [head, body]);
    head.addEventListener('click', () => row.classList.toggle('open'));
    return row;
  }
  function openAgent(id) { const r = el('agentrow-' + id); if (r) r.classList.add('open'); }

  async function runAgents() {
    if (!state.months.length) { toast('Add some data first'); return; }
    if (running) return; running = true;
    const btns = [el('btnRunAgents'), el('btnRunAgents2')].filter(Boolean);
    btns.forEach(b => { b.dataset.t = b.textContent; b.innerHTML = '<span class="spin"></span> Running…'; b.disabled = true; });

    recompute(); // fresh deterministic results
    renderAgentList();

    if (L.isConfigured(settings)) {
      updateAiBadge('running');
      const agents = agentResults.all;
      let done = 0;
      await Promise.all(agents.map(async a => {
        const res = await L.narrate(a, metrics, settings);
        if (res && res.text) {
          liveNarratives[a.id] = res;
          const node = el('narr-' + a.id);
          if (node) { node.innerHTML = esc(res.text).replace(/\n/g, '<br>'); node.classList.add('live'); }
        }
        done++;
      }));
      const ok = Object.keys(liveNarratives).length;
      toast(ok ? 'Live AI wrote ' + ok + ' of ' + agents.length + ' narratives' : 'Live AI unavailable — kept built-in narratives');
      renderHero();
    } else {
      toast('Agents ran (built-in narratives). Add an API key for live AI.');
    }

    btns.forEach(b => { b.textContent = b.dataset.t || 'Run all agents'; b.disabled = false; });
    running = false;
    updateAiBadge();
  }

  async function doAsk() {
    const q = (el('askInput').value || '').trim();
    if (!q) return;
    if (!state.months.length) { toast('Add some data first'); return; }
    const box = el('askAnswer'); box.classList.remove('hidden');
    box.innerHTML = ''; box.appendChild(h('div', { class: 'who' }, ['Routing…']));
    const agent = routeQuestion(q);
    box.innerHTML = '';
    box.appendChild(h('div', { class: 'who' }, [agent.name + ' · ' + agent.role]));

    let answer = null;
    if (L.isConfigured(settings)) {
      box.appendChild(h('div', { class: 'narrative' }, ['Asking live AI…']));
      answer = await L.ask(q, agent, metrics, settings);
    }
    const text = (answer && answer.text) ? answer.text : fallbackAnswer(q, agent);
    box.innerHTML = '';
    box.appendChild(h('div', { class: 'who' }, [agent.name + ' · ' + agent.role + (answer && answer.live ? ' · live AI' : '')]));
    box.appendChild(h('div', { class: 'narrative' + (answer && answer.live ? ' live' : ''), html: esc(text).replace(/\n/g, '<br>') }));
    const chips = h('div', { class: 'metric-chips', style: 'margin-top:12px' }, (agent.chips || []).map(c => h('span', { class: 'chip' }, [c.label + ': ', h('b', {}, [c.value])])));
    box.appendChild(chips);
  }

  function routeQuestion(q) {
    const s = q.toLowerCase();
    let best = null, bestScore = -1;
    agentResults.specialists.forEach(a => {
      let score = 0;
      (a.keywords || []).forEach(k => { if (s.indexOf(k) !== -1) score += k.length; });
      if (score > bestScore) { bestScore = score; best = a; }
    });
    if (bestScore <= 0) best = agentResults.specialists.find(a => a.id === 'profit') || agentResults.specialists[0];
    return best;
  }

  function fallbackAnswer(q, a) {
    const lead = 'Here is what I can tell you from the figures (' + a.name + '):\n';
    const chips = (a.chips || []).map(c => '• ' + c.label + ': ' + c.value).join('\n');
    return lead + a.narrative + '\n\nKey numbers:\n' + chips;
  }

  /* ================= DATA VIEW ================= */
  function bindDataView() {
    // tabs
    el('dataTabs').addEventListener('click', e => {
      const b = e.target.closest('.tab'); if (!b) return;
      document.querySelectorAll('#dataTabs .tab').forEach(t => t.classList.toggle('active', t === b));
      const name = b.getAttribute('data-tab');
      document.querySelectorAll('#pane-manual,#pane-upload,#pane-demo').forEach(p => p.classList.toggle('active', p.id === 'pane-' + name));
    });

    // profile
    el('inpBizName').addEventListener('input', e => { state.business.name = e.target.value; persistSoon(); renderKPIs(); });
    el('inpCurrency').addEventListener('change', e => { state.business.currency = e.target.value; settings.currency = e.target.value; syncSettingsForm(); recompute(); });
    el('inpCash').addEventListener('input', e => { state.cashOnHand = D.num(e.target.value); recompute(); });

    // add month
    el('btnAddMonth').addEventListener('click', addMonth);
    el('emptyDemo').addEventListener('click', () => loadSample('retail'));

    // demo
    renderDemoGrid();
    el('btnClearData').addEventListener('click', clearData);
    el('btnClearData2').addEventListener('click', clearData);

    // upload
    bindUpload();
  }

  function renderDemoGrid() {
    const grid = el('demoGrid'); grid.innerHTML = '';
    D.sampleList().forEach(s => {
      grid.appendChild(h('div', { class: 'demo-card', onclick: () => loadSample(s.key) }, [
        h('h4', {}, [s.title]), h('p', {}, [s.blurb]),
        h('button', { class: 'btn primary small', style: 'margin-top:10px' }, ['Load this business'])
      ]));
    });
  }

  function loadSample(key) {
    state = D.sampleState(key);
    settings.currency = state.business.currency;
    selectedMonthId = state.months.length ? state.months[0].id : null;
    syncDataForm(); syncSettingsForm(); recompute(); renderMonthList(); renderEditor();
    showView('dashboard');
    toast('Loaded sample business');
  }

  function clearData() {
    if (!confirm('Clear all business data? This cannot be undone.')) return;
    state = D.emptyState(); D.clear();
    selectedMonthId = null; liveNarratives = {};
    syncDataForm(); recompute(); renderMonthList(); renderEditor();
    toast('Data cleared');
  }

  function addMonth() {
    const v = el('inpMonthLabel').value;
    let label;
    if (v) label = v;
    else if (state.months.length) { const p = D.labelToParts(state.months[state.months.length - 1].label); const nx = D.addMonths(p.year, p.month0, 1); label = D.monthLabel(nx.year, nx.month0); }
    else { const now = new Date(); label = D.monthLabel(now.getFullYear(), now.getMonth()); }
    if (state.months.some(m => m.label === label)) { toast('That month already exists'); return; }
    const m = D.month(label, [{ name: 'Sales', amount: 0, category: 'Product' }], [{ name: 'Operating costs', amount: 0, type: 'fixed' }]);
    state.months.push(m);
    state.months.sort((a, b) => a.label < b.label ? -1 : 1);
    selectedMonthId = m.id;
    el('inpMonthLabel').value = '';
    renderMonthList(); renderEditor(); recompute();
  }

  function renderMonthList() {
    const list = el('monthList'); list.innerHTML = '';
    if (!state.months.length) { list.appendChild(h('span', { class: 'muted tiny' }, ['No months yet.'])); return; }
    state.months.forEach(m => {
      const chip = h('div', { class: 'month-chip' + (m.id === selectedMonthId ? ' active' : '') }, [
        h('span', { onclick: () => { selectedMonthId = m.id; renderMonthList(); renderEditor(); } }, [D.prettyLabel(m.label)]),
        h('span', { class: 'x', title: 'Delete month', onclick: (e) => { e.stopPropagation(); deleteMonth(m.id); } }, ['×'])
      ]);
      list.appendChild(chip);
    });
  }

  function deleteMonth(id) {
    state.months = state.months.filter(m => m.id !== id);
    if (selectedMonthId === id) selectedMonthId = state.months.length ? state.months[0].id : null;
    renderMonthList(); renderEditor(); recompute();
  }

  function syncDataForm() {
    el('inpBizName').value = state.business.name || '';
    el('inpCurrency').value = state.business.currency || 'INR';
    el('inpCash').value = state.cashOnHand || '';
  }

  function renderEditor() {
    const body = el('editorBody'); body.innerHTML = '';
    const m = state.months.find(x => x.id === selectedMonthId);
    if (!m) { body.appendChild(h('p', { class: 'muted' }, ['Select or add a month above to edit its line items.'])); el('editorTitle').textContent = 'Line items'; return; }
    el('editorTitle').textContent = 'Line items — ' + D.prettyLabel(m.label);

    const revCol = h('div', {}, [
      h('div', { class: 'subhead' }, ['Revenue', h('button', { class: 'addbtn', onclick: () => addLine(m, 'revenue') }, ['+ Add revenue'])]),
      h('div', { id: 'revRows' }, m.revenue.map(r => lineRow(m, 'revenue', r)))
    ]);
    const expCol = h('div', {}, [
      h('div', { class: 'subhead' }, ['Expenses', h('button', { class: 'addbtn', onclick: () => addLine(m, 'expenses') }, ['+ Add expense'])]),
      h('div', { id: 'expRows' }, m.expenses.map(e => lineRow(m, 'expenses', e)))
    ]);
    body.appendChild(revCol); body.appendChild(expCol);
    const totals = h('div', { style: 'grid-column:1/-1' }, [h('div', { class: 'mini-total', id: 'editorTotals' }, [])]);
    body.appendChild(totals);
    updateEditorTotals();
  }

  function lineRow(m, kind, item) {
    const isRev = kind === 'revenue';
    const nameIn = h('input', { type: 'text', value: item.name, placeholder: isRev ? 'Stream name' : 'Cost name' });
    const amtIn = h('input', { type: 'number', value: item.amount || '', placeholder: '0', min: '0', step: 'any' });
    const sel = isRev
      ? h('select', {}, D.REVENUE_CATEGORIES.map(c => h('option', { value: c, selected: c === item.category ? 'selected' : null }, [c])))
      : h('select', {}, D.EXPENSE_TYPES.map(t => h('option', { value: t, selected: t === item.type ? 'selected' : null }, [D.EXPENSE_TYPE_LABEL[t]])));
    const del = h('button', { class: 'del', title: 'Remove' }, ['×']);

    nameIn.addEventListener('input', () => { item.name = nameIn.value; persistSoon(); });
    amtIn.addEventListener('input', () => { item.amount = D.num(amtIn.value); updateEditorTotals(); recompute(); });
    sel.addEventListener('change', () => { if (isRev) item.category = sel.value; else item.type = sel.value; updateEditorTotals(); recompute(); });
    del.addEventListener('click', () => {
      m[kind] = m[kind].filter(x => x.id !== item.id);
      renderEditor(); recompute();
    });

    // layout: name, amount, select, delete
    const wrap = h('div', { class: 'line-item', style: 'grid-template-columns:1fr 96px 92px 28px' }, [nameIn, amtIn, sel, del]);
    return wrap;
  }

  function addLine(m, kind) {
    const item = kind === 'revenue'
      ? { id: D.uid('r'), name: '', amount: 0, category: 'Product' }
      : { id: D.uid('e'), name: '', amount: 0, type: 'fixed' };
    m[kind].push(item);
    renderEditor();
  }

  function updateEditorTotals() {
    const m = state.months.find(x => x.id === selectedMonthId);
    const node = el('editorTotals'); if (!m || !node) return;
    const rev = D.num(m.revenue.reduce((a, b) => a + D.num(b.amount), 0));
    const exp = D.num(m.expenses.reduce((a, b) => a + D.num(b.amount), 0));
    node.textContent = 'Revenue ' + money(rev) + '  ·  Expenses ' + money(exp) + '  ·  Net profit ' + money(rev - exp) + ' (' + pct(rev ? (rev - exp) / rev : 0) + ')';
  }

  /* ---------- upload ---------- */
  function bindUpload() {
    const dz = el('dropzone'), fi = el('fileInput');
    el('browseBtn').addEventListener('click', () => fi.click());
    dz.addEventListener('click', e => { if (e.target.tagName !== 'BUTTON') fi.click(); });
    fi.addEventListener('change', () => { if (fi.files[0]) handleFile(fi.files[0]); });
    ['dragover', 'dragenter'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
    dz.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) handleFile(f); });
    el('btnCancelMap').addEventListener('click', () => { el('mappingCard').classList.add('hidden'); lastMapping = null; });
  }

  function setUploadStatus(msg, kind) {
    const s = el('uploadStatus'); s.classList.remove('hidden', 'ok', 'err');
    if (kind) s.classList.add(kind);
    s.textContent = msg;
  }

  function handleFile(file) {
    if (!window.XLSX) { setUploadStatus('Spreadsheet library failed to load — check your connection.', 'err'); return; }
    setUploadStatus('Reading ' + file.name + '…');
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
        if (!rows.length) { setUploadStatus('The file looks empty.', 'err'); return; }
        showMapping(rows, file.name);
      } catch (err) {
        setUploadStatus('Could not parse that file: ' + err.message, 'err');
      }
    };
    reader.onerror = () => setUploadStatus('Could not read the file.', 'err');
    reader.readAsArrayBuffer(file);
  }

  function showMapping(rows, filename) {
    const headers = rows[0].map((h, i) => String(h || ('Column ' + (i + 1))));
    const data = rows.slice(1).filter(r => r.some(c => String(c).trim() !== ''));
    lastMapping = { headers, data, filename };
    setUploadStatus('Parsed ' + data.length + ' data rows from ' + filename + '. Confirm the mapping below.', 'ok');

    const card = el('mappingCard'); card.classList.remove('hidden');
    el('mapRowCount').textContent = data.length + ' rows · ' + headers.length + ' columns';
    const grid = el('mappingGrid'); grid.innerHTML = '';

    const opts = (sel) => headers.map((hh, i) => '<option value="' + i + '"' + (i === sel ? ' selected' : '') + '>' + esc(hh) + '</option>').join('');

    grid.appendChild(h('label', { html: 'Layout<br><select id="mapMode"><option value="lineitems">One row per line item</option><option value="permonth">One row per month</option></select>' }));
    grid.appendChild(h('label', { html: 'Month column<br><select id="mapMonth">' + opts(0) + '</select>' }));

    const li = h('div', { id: 'mapLineItems', class: 'mapping-grid', style: 'grid-column:1/-1' }, [
      h('label', { html: 'Description column<br><select id="mapDesc">' + opts(1) + '</select>' }),
      h('label', { html: 'Amount column<br><select id="mapAmount">' + opts(2) + '</select>' }),
      h('label', { html: 'Kind column (revenue / expense)<br><select id="mapKind">' + opts(3) + '</select>' }),
      h('label', { html: 'Category / type column (optional)<br><select id="mapCat"><option value="-1">— none —</option>' + headers.map((hh, i) => '<option value="' + i + '">' + esc(hh) + '</option>').join('') + '</select>' })
    ]);
    const pm = h('div', { id: 'mapPerMonth', class: 'mapping-grid hidden', style: 'grid-column:1/-1' }, [
      h('label', { html: 'Revenue column<br><select id="mapRev">' + opts(1) + '</select>' }),
      h('label', { html: 'Expenses column<br><select id="mapExp">' + opts(2) + '</select>' })
    ]);
    grid.appendChild(li); grid.appendChild(pm);

    el('mapMode').addEventListener('change', e => {
      const lineMode = e.target.value === 'lineitems';
      el('mapLineItems').classList.toggle('hidden', !lineMode);
      el('mapPerMonth').classList.toggle('hidden', lineMode);
    });

    renderPreview(headers, data.slice(0, 6));
    el('btnImport').onclick = doImport;
  }

  function renderPreview(headers, data) {
    const t = el('mapPreview');
    let html = '<thead><tr>' + headers.map(x => '<th>' + esc(x) + '</th>').join('') + '</tr></thead><tbody>';
    data.forEach(r => { html += '<tr>' + headers.map((_, i) => '<td>' + esc(r[i]) + '</td>').join('') + '</tr>'; });
    html += '</tbody>';
    t.innerHTML = html;
  }

  function parseMonthCell(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number' && window.XLSX && XLSX.SSF) {
      try { const d = XLSX.SSF.parse_date_code(v); if (d) return D.monthLabel(d.y, d.m - 1); } catch (e) {}
    }
    const s = String(v).trim();
    let m = s.match(/^(\d{4})[-/](\d{1,2})/);
    if (m) return D.monthLabel(+m[1], +m[2] - 1);
    m = s.match(/^(\d{1,2})[-/](\d{4})/);
    if (m) return D.monthLabel(+m[2], +m[1] - 1);
    m = s.match(/^([A-Za-z]{3,})\s*[-/]?\s*(\d{4})/);
    if (m) { const mi = D.MONTH_NAMES.findIndex(x => m[1].toLowerCase().startsWith(x.toLowerCase())); if (mi >= 0) return D.monthLabel(+m[2], mi); }
    const d = new Date(s);
    if (!isNaN(d)) return D.monthLabel(d.getFullYear(), d.getMonth());
    return null;
  }
  function numCell(v) { const n = Number(String(v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; }

  function doImport() {
    if (!lastMapping) return;
    const { data } = lastMapping;
    const mode = el('mapMode').value;
    const monthCol = +el('mapMonth').value;
    const byMonth = {};

    if (mode === 'lineitems') {
      const descCol = +el('mapDesc').value, amountCol = +el('mapAmount').value, kindCol = +el('mapKind').value, catCol = +el('mapCat').value;
      data.forEach(r => {
        const label = parseMonthCell(r[monthCol]); if (!label) return;
        const amount = numCell(r[amountCol]); const desc = String(r[descCol] || 'Item').trim() || 'Item';
        const kind = String(r[kindCol] || '').toLowerCase();
        const cat = catCol >= 0 ? String(r[catCol] || '').trim() : '';
        byMonth[label] = byMonth[label] || { rev: [], exp: [] };
        if (kind.indexOf('exp') !== -1 || kind.indexOf('cost') !== -1 || kind.indexOf('spend') !== -1) {
          byMonth[label].exp.push({ name: desc, amount, type: /fixed/i.test(cat) ? 'fixed' : /one[- ]?off/i.test(cat) ? 'one-off' : 'variable' });
        } else {
          byMonth[label].rev.push({ name: desc, amount, category: D.REVENUE_CATEGORIES.find(c => c.toLowerCase() === cat.toLowerCase()) || 'Other' });
        }
      });
    } else {
      const revCol = +el('mapRev').value, expCol = +el('mapExp').value;
      data.forEach(r => {
        const label = parseMonthCell(r[monthCol]); if (!label) return;
        byMonth[label] = byMonth[label] || { rev: [], exp: [] };
        const rv = numCell(r[revCol]), ex = numCell(r[expCol]);
        if (rv) byMonth[label].rev.push({ name: 'Revenue', amount: rv, category: 'Product' });
        if (ex) byMonth[label].exp.push({ name: 'Expenses', amount: ex, type: 'variable' });
      });
    }

    const labels = Object.keys(byMonth).sort();
    if (!labels.length) { setUploadStatus('No rows could be imported — check the month column mapping.', 'err'); return; }
    state.months = labels.map(l => D.month(l, byMonth[l].rev, byMonth[l].exp));
    selectedMonthId = state.months[0].id;
    el('mappingCard').classList.add('hidden');
    setUploadStatus('Imported ' + labels.length + ' months.', 'ok');
    renderMonthList(); renderEditor(); recompute();
    showView('dashboard');
    toast('Imported ' + labels.length + ' months');
  }

  /* ================= REPORT ================= */
  function bindReportView() {
    el('btnPrint').addEventListener('click', () => window.print());
    el('btnCopyReport').addEventListener('click', copyReport);
  }

  function renderReport() {
    const body = el('reportBody'); if (!body) return;
    if (!metrics || metrics.empty) { body.innerHTML = '<p class="muted">Add data to generate a report.</p>'; return; }
    const m = metrics;
    el('reportSubtitle').textContent = (state.business.name || 'Business') + ' · ' + m.n + ' months · generated ' + new Date().toLocaleDateString('en-IN');
    const kpis = [
      ['Revenue / month', money(m.avg.revenue)],
      ['Net profit rate', pct(m.avg.netMargin)],
      ['Net burn / month', m.burn.profitable ? 'Positive' : money(m.burn.netBurn)],
      ['Runway', m.burn.profitable ? '∞' : D.formatMonths(m.burn.runwayMonths)],
      ['Cash on hand', money(m.cash.cashOnHand)],
      ['Revenue CAGR', m.growth.cagr == null ? 'n/a' : pct(m.growth.cagr)],
      ['Health score', m.health.score + '/100 (' + m.health.grade + ')'],
      ['Lowest cash', money(m.cash.lowest)]
    ];
    let html = '<h1>' + esc(state.business.name || 'Business') + ' — Health Report</h1>';
    html += '<div class="rep-meta">' + esc(m.first.pretty) + ' to ' + esc(m.last.pretty) + ' · ' + m.n + ' months · currency ' + esc(m.currency) + '</div>';
    html += '<h2>Key metrics</h2><div class="rep-kpis">';
    kpis.forEach(k => { html += '<div class="rep-kpi"><div class="l">' + esc(k[0]) + '</div><div class="v">' + esc(k[1]) + '</div></div>'; });
    html += '</div>';

    html += '<h2>Executive summary</h2><p>' + esc(narr('cfo')) + '</p>';
    html += '<h2>Health breakdown</h2><div class="rep-kpis">';
    m.health.components.forEach(c => { html += '<div class="rep-kpi"><div class="l">' + esc(c.label) + '</div><div class="v">' + c.score + '/100</div></div>'; });
    html += '</div>';

    html += '<h2>Agent analysis</h2>';
    agentResults.specialists.forEach(a => {
      html += '<div class="rep-agent"><h3>' + a.icon + ' ' + esc(a.name) + ' — <span style="text-transform:capitalize">' + a.severity + '</span></h3>';
      html += '<p class="narr">' + esc(narr(a.id)) + '</p>';
      html += '<ul class="rec-list">' + a.recommendations.map(r => '<li>' + esc(r) + '</li>').join('') + '</ul></div>';
    });

    html += '<h2>Monthly detail</h2><div class="preview-wrap"><table class="rep-table"><thead><tr><th>Month</th><th>Revenue</th><th>Expenses</th><th>Net profit</th><th>Margin</th><th>Cash balance</th></tr></thead><tbody>';
    m.months.forEach(r => {
      html += '<tr><td>' + esc(r.pretty) + '</td><td>' + esc(money(r.revenue)) + '</td><td>' + esc(money(r.expenses)) + '</td><td>' + esc(money(r.netProfit)) + '</td><td>' + esc(pct(r.netMargin)) + '</td><td>' + esc(money(r.cumulativeCash)) + '</td></tr>';
    });
    html += '</tbody></table></div>';
    html += '<p class="tiny">Figures are estimates derived from the data entered and are not financial advice.</p>';
    body.innerHTML = html;
  }

  function narr(id) {
    if (liveNarratives[id]) return liveNarratives[id].text;
    const a = agentResults.all.find(x => x.id === id);
    return a ? a.narrative : '';
  }

  function copyReport() {
    if (!metrics || metrics.empty) { toast('Nothing to copy'); return; }
    let txt = (state.business.name || 'Business') + ' — Health Report\n' + metrics.n + ' months, ' + pct(metrics.avg.netMargin) + ' avg net margin, health ' + metrics.health.score + '/100 (Grade ' + metrics.health.grade + ').\n\n';
    txt += 'EXECUTIVE SUMMARY\n' + narr('cfo') + '\n\n';
    agentResults.specialists.forEach(a => { txt += a.name.toUpperCase() + '\n' + narr(a.id) + '\n\n'; });
    navigator.clipboard.writeText(txt).then(() => toast('Summary copied'), () => toast('Copy failed'));
  }

  /* ================= SETTINGS ================= */
  function bindSettingsView() {
    el('setCurrency').addEventListener('change', e => { settings.currency = e.target.value; state.business.currency = e.target.value; el('inpCurrency').value = e.target.value; recompute(); });
    el('setCompact').addEventListener('change', e => { settings.compact = e.target.value === 'compact'; recompute(); });
    el('setProvider').addEventListener('change', e => { settings.llm.provider = e.target.value; toggleBaseUrl(); });
    el('setModel').addEventListener('input', e => { settings.llm.model = e.target.value; });
    el('setApiKey').addEventListener('input', e => { settings.llm.apiKey = e.target.value; updateAiBadge(); });
    el('setBaseUrl').addEventListener('input', e => { settings.llm.baseUrl = e.target.value; });
    el('btnSaveSettings').addEventListener('click', () => { persist(); updateAiBadge(); toast('Settings saved'); });
    el('btnTestKey').addEventListener('click', testKey);
    el('btnClearKey').addEventListener('click', () => { settings.llm.apiKey = ''; el('setApiKey').value = ''; persist(); updateAiBadge(); setStatus('API key removed.', 'ok'); });
    el('btnExportJson').addEventListener('click', exportJson);
    el('btnImportJson').addEventListener('click', () => el('jsonInput').click());
    el('jsonInput').addEventListener('change', importJson);
  }

  function toggleBaseUrl() {
    el('baseUrlRow').classList.toggle('hidden', el('setProvider').value !== 'openai');
  }

  function syncSettingsForm() {
    el('setCurrency').value = settings.currency;
    el('setCompact').value = settings.compact ? 'compact' : 'full';
    el('setProvider').value = settings.llm.provider || 'openai';
    el('setModel').value = settings.llm.model || '';
    el('setApiKey').value = settings.llm.apiKey || '';
    el('setBaseUrl').value = settings.llm.baseUrl || '';
    toggleBaseUrl();
  }

  function setStatus(msg, kind) {
    const s = el('settingsStatus'); s.classList.remove('hidden', 'ok', 'err');
    if (kind) s.classList.add(kind);
    s.textContent = msg;
  }

  async function testKey() {
    persist();
    setStatus('Testing key…');
    const r = await L.test(settings);
    setStatus(r.message, r.ok ? 'ok' : 'err');
    updateAiBadge();
  }

  function updateAiBadge(mode) {
    const badge = el('aiBadge'), txt = el('aiBadgeText');
    const configured = L.isConfigured(settings);
    if (mode === 'running') { badge.classList.add('live'); txt.textContent = 'Live AI running…'; return; }
    badge.classList.toggle('live', configured);
    txt.textContent = configured ? 'Live LLM · ' + (settings.llm.provider === 'anthropic' ? 'Anthropic' : 'OpenAI') : 'Built-in mode';
    const st = el('sideTipText');
    if (st) st.textContent = configured ? 'Live AI is on — the agents write their commentary with your LLM.' : 'Numbers are computed locally. Add a key for LLM-written commentary.';
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify({ state, settings: { currency: settings.currency, compact: settings.compact } }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'bizpulse-data.json';
    a.click();
    toast('Exported');
  }
  function importJson(e) {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => {
      try {
        const d = JSON.parse(ev.target.result);
        if (d.state && Array.isArray(d.state.months)) {
          state = d.state;
          if (d.settings) settings = Object.assign(settings, d.settings);
          selectedMonthId = state.months.length ? state.months[0].id : null;
          syncDataForm(); syncSettingsForm(); recompute(); renderMonthList(); renderEditor();
          showView('dashboard'); toast('Data imported');
        } else toast('That file is not a BizPulse export');
      } catch (err) { toast('Could not read that file'); }
    };
    r.readAsText(f);
  }

  /* ---------- go ---------- */
  document.addEventListener('DOMContentLoaded', init);
})();
