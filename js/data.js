/* ============================================================
   BizPulse AI — data layer
   Data model, sample templates, persistence, formatting helpers.
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

  /* ---------- seeded random for reproducible samples ---------- */
  function seeded(seed) {
    let s = seed >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
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

  /* ---------- sample templates ---------- */
  function buildSample(spec) {
    const months = [];
    let cur = { year: spec.startYear, month0: spec.startMonth0 };
    const rnd = seeded(spec.seed);
    for (let i = 0; i < spec.count; i++) {
      const rev = spec.revenue.map(item => {
        const base = item.base * Math.pow(1 + item.growth, i);
        const noise = 1 + (rnd() - 0.5) * (item.vol || 0.16);
        const seasonal = item.seasonal ? item.seasonal[i % item.seasonal.length] : 1;
        return { name: item.name, category: item.category, amount: Math.round(base * noise * seasonal) };
      });
      const exp = spec.expenses.map(item => {
        const base = item.base * Math.pow(1 + (item.growth || 0), i);
        const noise = 1 + (rnd() - 0.5) * (item.vol || 0.07);
        const oneoff = item.oneoffAt === i ? item.oneoffAmount : 0;
        return { name: item.name, type: item.type, amount: Math.round(base * noise + oneoff) };
      });
      months.push(month(monthLabel(cur.year, cur.month0), rev, exp));
      cur = addMonths(cur.year, cur.month0, 1);
    }
    return {
      business: { name: spec.name, industry: spec.industry || '', foundedYear: '', employees: '', currency: spec.currency, target: 0 },
      cashOnHand: spec.cashOnHand,
      months: months,
      meetings: []
    };
  }

  const SAMPLE_SPECS = {
    retail: {
      key: 'retail',
      title: 'Retail template',
      blurb: 'Illustrative template — an omni-channel retailer with steady growth and thin margins. Not a real company. ₹ INR.',
      seed: 20240115,
      name: 'Sample Retail Business',
      industry: 'Retail',
      currency: 'INR',
      startYear: 2024, startMonth0: 4, count: 12,
      cashOnHand: 6000000,
      revenue: [
        { name: 'Store sales', category: 'Product', base: 1050000, growth: 0.018, vol: 0.12, seasonal: [1, 0.92, 1.05, 1.0, 1.12, 1.08, 0.95, 1.0, 1.15, 1.28, 1.35, 1.1] },
        { name: 'Online store', category: 'Product', base: 520000, growth: 0.055, vol: 0.18 },
        { name: 'Wholesale accounts', category: 'Other', base: 380000, growth: 0.01, vol: 0.22 }
      ],
      expenses: [
        { name: 'Store rent', type: 'fixed', base: 260000, growth: 0.004, vol: 0.01 },
        { name: 'Staff salaries', type: 'fixed', base: 470000, growth: 0.012, vol: 0.02 },
        { name: 'Inventory / COGS', type: 'variable', base: 720000, growth: 0.02, vol: 0.14 },
        { name: 'Logistics', type: 'variable', base: 105000, growth: 0.03, vol: 0.16 },
        { name: 'Marketing', type: 'variable', base: 130000, growth: 0.02, vol: 0.25 },
        { name: 'Utilities', type: 'fixed', base: 62000, growth: 0.01, vol: 0.08 },
        { name: 'Software & tools', type: 'fixed', base: 38000, growth: 0.02, vol: 0.04 },
        { name: 'Equipment upgrade', type: 'one-off', base: 0, oneoffAt: 7, oneoffAmount: 320000 }
      ]
    },
    saas: {
      key: 'saas',
      title: 'SaaS template',
      blurb: 'Illustrative template — an early-stage B2B SaaS with high burn and strong growth. Not a real company. $ USD.',
      seed: 777001,
      name: 'Sample SaaS Business',
      industry: 'Software / SaaS',
      currency: 'USD',
      startYear: 2024, startMonth0: 6, count: 12,
      cashOnHand: 920000,
      revenue: [
        { name: 'Subscription plans', category: 'Subscriptions', base: 41000, growth: 0.11, vol: 0.07 },
        { name: 'Professional services', category: 'Services', base: 14000, growth: 0.05, vol: 0.3 }
      ],
      expenses: [
        { name: 'Engineering salaries', type: 'fixed', base: 92000, growth: 0.02, vol: 0.02 },
        { name: 'Sales & marketing', type: 'variable', base: 58000, growth: 0.045, vol: 0.2 },
        { name: 'Cloud & hosting', type: 'variable', base: 17000, growth: 0.09, vol: 0.12 },
        { name: 'G&A', type: 'fixed', base: 24000, growth: 0.015, vol: 0.05 },
        { name: 'Office & tools', type: 'fixed', base: 14000, growth: 0.01, vol: 0.05 },
        { name: 'Conference booth', type: 'one-off', base: 0, oneoffAt: 5, oneoffAmount: 42000 }
      ]
    },
    foods: {
      key: 'foods',
      title: 'Restaurant template',
      blurb: 'Illustrative template — a two-outlet restaurant group, profitable and seasonal. Not a real company. ₹ INR.',
      seed: 55123,
      name: 'Sample Restaurant Business',
      industry: 'Food & beverage',
      currency: 'INR',
      startYear: 2024, startMonth0: 3, count: 12,
      cashOnHand: 10000000,
      revenue: [
        { name: 'Dine-in', category: 'Product', base: 1250000, growth: 0.006, vol: 0.1, seasonal: [1, 1.0, 1.05, 0.95, 0.9, 0.85, 1.0, 1.1, 1.2, 1.35, 1.3, 1.15] },
        { name: 'Delivery', category: 'Product', base: 560000, growth: 0.03, vol: 0.14 },
        { name: 'Catering & events', category: 'Services', base: 240000, growth: 0.01, vol: 0.35 }
      ],
      expenses: [
        { name: 'Kitchen staff', type: 'fixed', base: 380000, growth: 0.012, vol: 0.02 },
        { name: 'Outlet rent', type: 'fixed', base: 300000, growth: 0.005, vol: 0.01 },
        { name: 'Food ingredients', type: 'variable', base: 620000, growth: 0.008, vol: 0.12 },
        { name: 'Delivery commissions', type: 'variable', base: 96000, growth: 0.03, vol: 0.14 },
        { name: 'Utilities & gas', type: 'fixed', base: 85000, growth: 0.012, vol: 0.1 },
        { name: 'Marketing', type: 'variable', base: 55000, growth: 0.02, vol: 0.25 },
        { name: 'Renovation', type: 'one-off', base: 0, oneoffAt: 9, oneoffAmount: 410000 }
      ]
    }
  };

  function sampleState(key) {
    const spec = SAMPLE_SPECS[key];
    if (!spec) return emptyState();
    return buildSample(spec);
  }
  function sampleList() { return Object.values(SAMPLE_SPECS).map(s => ({ key: s.key, title: s.title, blurb: s.blurb })); }

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
    emptyState, sampleState, sampleList,
    save, load, clear, saveSettings, loadSettings,
    symbol, formatMoney, formatNumber, formatPct, formatMonths
  };
})();
