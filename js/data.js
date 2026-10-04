/* ============================================================
   BizPulse AI — data layer
   Data model, persistence, formatting helpers.
   Exposes: window.BPData
   ============================================================ */
(function () {
  const STORAGE_KEY = 'bizpulse.state.v1';
  const SETTINGS_KEY = 'bizpulse.settings.v1';

  /* ---------- ids & dates ---------- */
  let _idc = 0;
  function uid(p) { _idc++; return (p || 'id') + '_' + Date.now().toString(36) + '_' + _idc; }

  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function addMonths(year, month0, n) { // month0: 0-11
    const total = year * 12 + month0 + n;
    return { year: Math.floor(total / 12), month0: ((total % 12) + 12) % 12 };
  }
  function monthLabel(year, month0) {
    return year + '-' + String(month0 + 1).padStart(2, '0');
  }
  function labelToParts(label) {
    const parts = String(label).split('-');
    const y = Number(parts[0]);
    const m = Number(parts[1]);
    return { year: isFinite(y) ? y : new Date().getFullYear(), month0: isFinite(m) ? Math.max(0, Math.min(11, m - 1)) : 0 };
  }
  function prettyLabel(label) {
    const { year, month0 } = labelToParts(label);
    return MONTH_NAMES[month0] + ' ' + year;
  }

  /* ---------- revenue / expense taxonomies ---------- */
  const REVENUE_CATEGORIES = ['Product', 'Services', 'Subscriptions', 'Other'];
  const EXPENSE_TYPES = ['fixed', 'variable', 'one-off'];
  const EXPENSE_TYPE_LABEL = { 'fixed': 'Fixed', 'variable': 'Variable (COGS)', 'one-off': 'One-off' };

  /* ---------- empty state ---------- */
  function emptyState() {
    return {
      business: { name: '', industry: '', foundedYear: '', employees: '', currency: 'INR', target: 0 },
      cashOnHand: 0,
      months: [],
      meetings: []
    };
  }

  /* ---------- month builder ---------- */
  function month(label, revenue, expenses) {
    return {
      id: uid('m'),
      label: label,
      revenue: (revenue || []).map(r => ({ id: uid('r'), name: r.name, amount: num(r.amount), category: r.category || 'Other' })),
      expenses: (expenses || []).map(e => ({ id: uid('e'), name: e.name, amount: num(e.amount), type: e.type || 'fixed' }))
    };
  }
  function num(v) { const n = Number(v); return isFinite(n) ? n : 0; }

  /* ---------- persistence ---------- */
  function save(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* quota */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !Array.isArray(s.months)) return null;
      return s;
    } catch (e) { return null; }
  }
  function clear() { try { localStorage.removeItem(STORAGE_KEY); } catch (e) {} }

  function saveSettings(s) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) {} }
  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  /* ---------- formatting ---------- */
  const CURRENCY_SYMBOL = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };
  const CURRENCY_LOCALE = { INR: 'en-IN', USD: 'en-US', EUR: 'de-DE', GBP: 'en-GB' };

  function symbol(cur) { return CURRENCY_SYMBOL[cur] || ''; }

  function formatMoney(v, cur, mode) {
    cur = cur || 'INR';
    mode = mode || 'compact';
    if (v == null || !isFinite(v)) return '—';
    const sym = symbol(cur);
    const neg = v < 0;
    const a = Math.abs(v);
    let out;
    if (mode === 'compact') {
      if (cur === 'INR') {
        if (a >= 1e7) out = trim(a / 1e7) + 'Cr';
        else if (a >= 1e5) out = trim(a / 1e5) + 'L';
        else if (a >= 1e3) out = trim(a / 1e3) + 'K';
        else out = trim(a);
      } else {
        if (a >= 1e9) out = trim(a / 1e9) + 'B';
        else if (a >= 1e6) out = trim(a / 1e6) + 'M';
        else if (a >= 1e3) out = trim(a / 1e3) + 'K';
        else out = trim(a);
      }
    } else {
      const locale = CURRENCY_LOCALE[cur] || 'en-IN';
      out = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(a);
    }
    return (neg ? '-' : '') + sym + out;
  }
  function trim(n) {
    const r = Math.round(n * 10) / 10;
    return (Math.abs(r - Math.round(r)) < 0.05 ? String(Math.round(r)) : r.toFixed(1));
  }
  function formatNumber(v, digits) {
    if (v == null || !isFinite(v)) return '—';
    return new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits == null ? 1 : digits }).format(v);
  }
  function formatPct(v, digits) {
    if (v == null || !isFinite(v)) return '—';
    return (v * 100).toFixed(digits == null ? 1 : digits) + '%';
  }
  function formatMonths(v) {
    if (v == null || !isFinite(v)) return '—';
    if (v === Infinity || v > 120) return '120+';
    return v.toFixed(1) + ' mo';
  }

  const INDUSTRIES = ['Retail', 'Software / SaaS', 'Food & beverage', 'Manufacturing', 'Services / Agency', 'E-commerce', 'Healthcare', 'Education', 'Logistics', 'Other'];

  window.BPData = {
    uid, month, num,
    addMonths, monthLabel, labelToParts, prettyLabel, MONTH_NAMES,
    REVENUE_CATEGORIES, EXPENSE_TYPES, EXPENSE_TYPE_LABEL, INDUSTRIES,
    emptyState,
    save, load, clear, saveSettings, loadSettings,
    symbol, formatMoney, formatNumber, formatPct, formatMonths
  };
})();
