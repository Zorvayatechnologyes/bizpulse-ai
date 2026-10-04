/* ============================================================
   BizPulse AI — charts (Chart.js wrappers)
   Exposes: window.BPCharts.render(metrics, settings)
   ============================================================ */
(function () {
  const D = window.BPData;
  const store = {};

  const PALETTE = ['#5D6B6B', '#9FC0C1', '#E9A9A7', '#B8CFCF', '#C9A9A6', '#7FA8A8', '#E3C79A', '#A9BFBF', '#8B9898', '#D5E5E5'];

  function money(v, cur) { return D.formatMoney(v, cur, 'compact'); }

  function setDefaults() {
    if (!window.Chart) return;
    Chart.defaults.font.family = "'Inter',-apple-system,Segoe UI,Roboto,sans-serif";
    Chart.defaults.font.size = 11.5;
    Chart.defaults.color = '#5D6B6B';
    Chart.defaults.plugins.legend.labels.boxWidth = 10;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.padding = 14;
    Chart.defaults.layout = { padding: { top: 4, bottom: 2 } };
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
    return { grid: { color: '#E4EDED', drawBorder: false }, ticks: { maxTicksLimit: 6 } };
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
          { label: 'Revenue', data: m.months.map(r => r.revenue), backgroundColor: '#5D6B6B', borderRadius: 6, maxBarThickness: 26 },
          { label: 'Expenses', data: m.months.map(r => r.expenses), backgroundColor: '#BDD7D8', borderRadius: 6, maxBarThickness: 26 }
        ]
      },
      options: { plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => c.dataset.label + ': ' + money(c.parsed.y, cur) } } },
        scales: { x: { grid: { display: false }, ticks: { autoSkip: true, maxTicksLimit: 8, maxRotation: 0 } }, y: Object.assign({ beginAtZero: true }, gridY(), { ticks: { callback: v => money(v, cur), maxTicksLimit: 6 } }) } }
    });

    /* 2 — net profit + margin */
    make('chartProfit', {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Net profit', data: m.months.map(r => r.netProfit), backgroundColor: m.months.map(r => r.netProfit >= 0 ? '#5F9E83' : '#C07878'), borderRadius: 6, maxBarThickness: 26, yAxisID: 'y' },
          { label: 'Net margin', data: m.months.map(r => +(r.netMargin * 100).toFixed(1)), type: 'line', borderColor: '#7FA8A8', backgroundColor: '#7FA8A8', borderWidth: 2.5, tension: 0.35, pointRadius: 3, yAxisID: 'y1' }
        ]
      },
      options: {
        plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => c.dataset.label + ': ' + (c.dataset.yAxisID === 'y1' ? c.parsed.y + '%' : money(c.parsed.y, cur)) } } },
        scales: {
          x: { grid: { display: false }, ticks: { autoSkip: true, maxTicksLimit: 8, maxRotation: 0 } },
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
          { label: 'Cash in', data: m.months.map(r => r.cashIn), backgroundColor: '#5F9E83', borderRadius: 5, maxBarThickness: 20, yAxisID: 'y' },
          { label: 'Cash out', data: m.months.map(r => r.cashOut), backgroundColor: '#E0AEAC', borderRadius: 5, maxBarThickness: 20, yAxisID: 'y' },
          { label: 'Cash balance', data: m.months.map(r => r.cumulativeCash), type: 'line', borderColor: '#5D6B6B', backgroundColor: '#5D6B6B', borderWidth: 2.5, tension: 0.35, pointRadius: 2, yAxisID: 'y1' }
        ]
      },
      options: {
        plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => c.dataset.label + ': ' + money(c.parsed.y, cur) } } },
        scales: {
          x: { grid: { display: false }, ticks: { autoSkip: true, maxTicksLimit: 8, maxRotation: 0 } },
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
          { label: 'Gross burn', data: m.months.map(r => r.grossBurn), borderColor: '#C07878', backgroundColor: 'rgba(192,120,120,.14)', borderWidth: 2.5, fill: true, tension: 0.35, pointRadius: 2 },
          { label: 'Net burn', data: m.months.map(r => r.netBurn), borderColor: '#B0863F', backgroundColor: 'rgba(176,134,63,.14)', borderWidth: 2.5, fill: true, tension: 0.35, pointRadius: 2 }
        ]
      },
      options: {
        plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => c.dataset.label + ': ' + money(c.parsed.y, cur) } } },
        scales: { x: { grid: { display: false }, ticks: { autoSkip: true, maxTicksLimit: 8, maxRotation: 0 } }, y: Object.assign({}, gridY(), { ticks: { callback: v => money(v, cur), maxTicksLimit: 6 } }) }
      }
    });

    /* 5 — expense mix */
    const expTop = m.expenseBreakdown.slice(0, 6);
    const expRest = m.expenseBreakdown.slice(6).reduce((a, b) => a + b.amount, 0);
    const expLabels = expTop.map(e => e.name).concat(expRest > 0 ? ['Other'] : []);
    const expData = expTop.map(e => e.amount).concat(expRest > 0 ? [expRest] : []);
    const expColors = expLabels.map((l, i) => l === 'Other' ? '#9AA6A6' : PALETTE[i % PALETTE.length]);
    make('chartExpenseMix', {
      type: 'doughnut',
      data: { labels: expLabels, datasets: [{ data: expData, backgroundColor: expColors, borderWidth: 2, borderColor: '#fff' }] },
      options: { cutout: '60%', plugins: { legend: { position: 'right', labels: { padding: 12 } }, tooltip: { callbacks: { label: c => c.label + ': ' + money(c.parsed, cur) + ' (' + D.formatPct(m.totals.expenses ? c.parsed / m.totals.expenses : 0, 0) + ')' } } } }
    });

    /* 6 — revenue mix */
    const revTop = m.revenueBreakdown.slice(0, 6);
    const revRest = m.revenueBreakdown.slice(6).reduce((a, b) => a + b.amount, 0);
    const revLabels = revTop.map(e => e.name).concat(revRest > 0 ? ['Other'] : []);
    const revData = revTop.map(e => e.amount).concat(revRest > 0 ? [revRest] : []);
    const revColors = revLabels.map((l, i) => l === 'Other' ? '#9AA6A6' : PALETTE[i % PALETTE.length]);
    make('chartRevenueMix', {
      type: 'doughnut',
      data: { labels: revLabels, datasets: [{ data: revData, backgroundColor: revColors, borderWidth: 2, borderColor: '#fff' }] },
      options: { cutout: '60%', plugins: { legend: { position: 'right', labels: { padding: 12 } }, tooltip: { callbacks: { label: c => c.label + ': ' + money(c.parsed, cur) + ' (' + D.formatPct(m.totals.revenue ? c.parsed / m.totals.revenue : 0, 0) + ')' } } } }
    });
  }

  window.BPCharts = { render };
})();
