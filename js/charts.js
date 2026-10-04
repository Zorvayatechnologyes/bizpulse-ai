/* ============================================================
   BizPulse AI — charts (Chart.js wrappers)
   Exposes: window.BPCharts.render(metrics, settings)
   ============================================================ */
(function () {
  const D = window.BPData;
  const store = {};

  const PALETTE = ['#3b4bd8', '#0ea5a4', '#7c3aed', '#d97706', '#e0533d', '#0891b2', '#65a30d', '#db2777', '#475569', '#a16207'];

  function money(v, cur) { return D.formatMoney(v, cur, 'compact'); }

  function setDefaults() {
    if (!window.Chart) return;
    Chart.defaults.font.family = "'Inter',-apple-system,Segoe UI,Roboto,sans-serif";
    Chart.defaults.font.size = 11.5;
    Chart.defaults.color = '#4a5570';
    Chart.defaults.plugins.legend.labels.boxWidth = 10;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.maintainAspectRatio = false;
  }

  function make(id, config) {
    const el = document.getElementById(id);
    if (!el || !window.Chart) return null;
    if (store[id]) { store[id].destroy(); }
    store[id] = new Chart(el.getContext('2d'), config);
    return store[id];
  }

  function gridY() {
    return { grid: { color: '#eef0f7', drawBorder: false }, ticks: { maxTicksLimit: 6 } };
  }

  function render(m, settings) {
    setDefaults();
    if (!window.Chart) return;
    if (!m || m.empty) {
      Object.keys(store).forEach(k => { store[k].destroy(); delete store[k]; });
      return;
    }
    const cur = m.currency;
    const labels = m.months.map(r => r.pretty);

    /* 1 — revenue vs expenses */
    make('chartRevExp', {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Revenue', data: m.months.map(r => r.revenue), backgroundColor: '#3b4bd8', borderRadius: 4, maxBarThickness: 26 },
          { label: 'Expenses', data: m.months.map(r => r.expenses), backgroundColor: '#c7ccf5', borderRadius: 4, maxBarThickness: 26 }
        ]
      },
      options: { plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => c.dataset.label + ': ' + money(c.parsed.y, cur) } } },
        scales: { x: { grid: { display: false } }, y: Object.assign({ beginAtZero: true }, gridY(), { ticks: { callback: v => money(v, cur), maxTicksLimit: 6 } }) } }
    });

    /* 2 — net profit + margin */
    make('chartProfit', {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Net profit', data: m.months.map(r => r.netProfit), backgroundColor: m.months.map(r => r.netProfit >= 0 ? '#16a34a' : '#dc2626'), borderRadius: 4, maxBarThickness: 26, yAxisID: 'y' },
          { label: 'Net margin', data: m.months.map(r => +(r.netMargin * 100).toFixed(1)), type: 'line', borderColor: '#7c3aed', backgroundColor: '#7c3aed', tension: 0.35, pointRadius: 3, yAxisID: 'y1' }
        ]
      },
      options: {
        plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => c.dataset.label + ': ' + (c.dataset.yAxisID === 'y1' ? c.parsed.y + '%' : money(c.parsed.y, cur)) } } },
        scales: {
          x: { grid: { display: false } },
          y: Object.assign({ beginAtZero: true }, gridY(), { ticks: { callback: v => money(v, cur), maxTicksLimit: 6 } }),
          y1: { position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: v => v + '%', maxTicksLimit: 6 } }
        }
      }
    });

    /* 3 — cash flow + running cash */
    make('chartCash', {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Cash in', data: m.months.map(r => r.cashIn), backgroundColor: '#0ea5a4', borderRadius: 4, maxBarThickness: 20, yAxisID: 'y' },
          { label: 'Cash out', data: m.months.map(r => r.cashOut), backgroundColor: '#f0b7ae', borderRadius: 4, maxBarThickness: 20, yAxisID: 'y' },
          { label: 'Cash balance', data: m.months.map(r => r.cumulativeCash), type: 'line', borderColor: '#111a2e', backgroundColor: '#111a2e', tension: 0.35, pointRadius: 2, yAxisID: 'y1' }
        ]
      },
      options: {
        plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => c.dataset.label + ': ' + money(c.parsed.y, cur) } } },
        scales: {
          x: { grid: { display: false } },
          y: Object.assign({ beginAtZero: true }, gridY(), { ticks: { callback: v => money(v, cur), maxTicksLimit: 6 } }),
          y1: { position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: v => money(v, cur), maxTicksLimit: 6 } }
        }
      }
    });

    /* 4 — burn trend */
    make('chartBurn', {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Gross burn', data: m.months.map(r => r.grossBurn), borderColor: '#e0533d', backgroundColor: 'rgba(224,83,61,.12)', fill: true, tension: 0.35, pointRadius: 2 },
          { label: 'Net burn', data: m.months.map(r => r.netBurn), borderColor: '#d97706', backgroundColor: 'rgba(217,119,6,.12)', fill: true, tension: 0.35, pointRadius: 2 }
        ]
      },
      options: {
        plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => c.dataset.label + ': ' + money(c.parsed.y, cur) } } },
        scales: { x: { grid: { display: false } }, y: Object.assign({}, gridY(), { ticks: { callback: v => money(v, cur), maxTicksLimit: 6 } }) }
      }
    });

    /* 5 — expense mix */
    const expTop = m.expenseBreakdown.slice(0, 6);
    const expRest = m.expenseBreakdown.slice(6).reduce((a, b) => a + b.amount, 0);
    const expLabels = expTop.map(e => e.name).concat(expRest > 0 ? ['Other'] : []);
    const expData = expTop.map(e => e.amount).concat(expRest > 0 ? [expRest] : []);
    make('chartExpenseMix', {
      type: 'doughnut',
      data: { labels: expLabels, datasets: [{ data: expData, backgroundColor: PALETTE, borderWidth: 2, borderColor: '#fff' }] },
      options: { cutout: '58%', plugins: { legend: { position: 'right' }, tooltip: { callbacks: { label: c => c.label + ': ' + money(c.parsed, cur) + ' (' + D.formatPct(m.totals.expenses ? c.parsed / m.totals.expenses : 0, 0) + ')' } } } }
    });

    /* 6 — revenue mix */
    const revTop = m.revenueBreakdown.slice(0, 6);
    const revRest = m.revenueBreakdown.slice(6).reduce((a, b) => a + b.amount, 0);
    const revLabels = revTop.map(e => e.name).concat(revRest > 0 ? ['Other'] : []);
    const revData = revTop.map(e => e.amount).concat(revRest > 0 ? [revRest] : []);
    make('chartRevenueMix', {
      type: 'doughnut',
      data: { labels: revLabels, datasets: [{ data: revData, backgroundColor: PALETTE.slice().reverse(), borderWidth: 2, borderColor: '#fff' }] },
      options: { cutout: '58%', plugins: { legend: { position: 'right' }, tooltip: { callbacks: { label: c => c.label + ': ' + money(c.parsed, cur) + ' (' + D.formatPct(m.totals.revenue ? c.parsed / m.totals.revenue : 0, 0) + ')' } } } }
    });
  }

  window.BPCharts = { render };
})();
