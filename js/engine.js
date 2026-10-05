/* ============================================================
   BizPulse AI — metrics engine
   Deterministic financial analysis. No LLM here: every number
   is computed from the user's data with standard formulas.
   Exposes: window.BPEngine.compute(state)
   ============================================================ */
(function () {
  const D = window.BPData;

  function sum(arr) { return arr.reduce((a, b) => a + b, 0); }
  function avg(arr) { return arr.length ? sum(arr) / arr.length : 0; }
  function median(arr) {
    if (!arr.length) return 0;
    const s = arr.slice().sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function stdev(arr) {
    if (arr.length < 2) return 0;
    const m = avg(arr);
    return Math.sqrt(avg(arr.map(x => (x - m) * (x - m))));
  }
  function safeDiv(a, b) { if (!isFinite(a) || !isFinite(b) || b === 0) return 0; return a / b; }
  function round(v, d) { const f = Math.pow(10, d == null ? 2 : d); return Math.round(v * f) / f; }

  function monthTotals(m) {
    /* Defensive: tolerate missing arrays and non-numeric amounts so a malformed
       import can never produce NaN/Infinity or throw. */
    const revItems = Array.isArray(m && m.revenue) ? m.revenue : [];
    const expItems = Array.isArray(m && m.expenses) ? m.expenses : [];
    const n = D.num;
    const byType = (t) => sum(expItems.filter(e => e && e.type === t).map(e => n(e.amount)));
    const revenue = sum(revItems.map(r => n(r && r.amount)));
    const fixed = byType('fixed');
    const variable = byType('variable');
    const oneoff = byType('one-off');
    const expenses = fixed + variable + oneoff;
    const grossProfit = revenue - variable;          // variable = cost of revenue
    const netProfit = revenue - expenses;
    return {
      revenue, fixed, variable, oneoff, expenses, grossProfit, netProfit,
      grossMargin: safeDiv(grossProfit, revenue),
      netMargin: safeDiv(netProfit, revenue)
    };
  }

  function compute(state) {
    const months = (state && state.months) ? state.months : [];
    const cashOnHand = D.num(state && state.cashOnHand);

    if (!months.length) {
      return { empty: true, n: 0, months: [], totals: {}, avg: {}, health: { score: 0, grade: '—', components: [] }, anomalies: [] };
    }

    /* ---- per month ---- */
    const rows = months.map(m => {
      if (!m || typeof m !== 'object') return null;   /* tolerate null/garbage entries */
      const t = monthTotals(m);
      return Object.assign({ label: m.label, pretty: D.prettyLabel(m.label) }, t);
    }).filter(Boolean);
    rows.sort((a, b) => a.label < b.label ? -1 : a.label > b.label ? 1 : 0);

    // growth + cash flow
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i], p = rows[i - 1];
      r.revenueGrowth = p && p.revenue > 0 ? safeDiv(r.revenue - p.revenue, p.revenue) : null;
      r.cashIn = r.revenue;
      r.cashOut = r.expenses;
      r.netCashFlow = r.revenue - r.expenses;
      r.grossBurn = r.expenses;
      r.netBurn = r.expenses - r.revenue;      // >0 means burning cash
    }
    // cumulative cash position: assume cashOnHand is the position at END of last month
    const totalNetCF = sum(rows.map(r => r.netCashFlow));
    let running = cashOnHand - totalNetCF;
    const startCash = running;
    for (let i = 0; i < rows.length; i++) {
      running += rows[i].netCashFlow;
      rows[i].cumulativeCash = running;
    }
    const cashSeries = [startCash].concat(rows.map(r => r.cumulativeCash));
    const lowestCash = Math.min.apply(null, cashSeries);
    const lowestIdx = cashSeries.indexOf(lowestCash);
    const lowestCashLabel = lowestIdx === 0 ? 'opening' : rows[lowestIdx - 1].pretty;

    /* ---- totals & averages ---- */
    const totals = {
      revenue: sum(rows.map(r => r.revenue)),
      expenses: sum(rows.map(r => r.expenses)),
      grossProfit: sum(rows.map(r => r.grossProfit)),
      netProfit: sum(rows.map(r => r.netProfit)),
      fixed: sum(rows.map(r => r.fixed)),
      variable: sum(rows.map(r => r.variable)),
      oneoff: sum(rows.map(r => r.oneoff))
    };
    totals.grossMargin = safeDiv(totals.grossProfit, totals.revenue);
    totals.netMargin = safeDiv(totals.netProfit, totals.revenue);

    const averages = {
      revenue: avg(rows.map(r => r.revenue)),
      expenses: avg(rows.map(r => r.expenses)),
      netProfit: avg(rows.map(r => r.netProfit)),
      netMargin: avg(rows.map(r => r.netMargin))
    };

    /* ---- growth ---- */
    const first = rows[0], last = rows[rows.length - 1];
    const n = rows.length;
    const momGrowths = rows.map(r => r.revenueGrowth).filter(g => g != null);
    const cagr = (n > 1 && first.revenue > 0 && last.revenue > 0)
      ? Math.pow(last.revenue / first.revenue, 12 / (n - 1)) - 1
      : null;
    const growth = {
      momLast: last.revenueGrowth,
      momAvg: momGrowths.length ? avg(momGrowths) : null,
      cagr: cagr,
      firstRevenue: first.revenue,
      lastRevenue: last.revenue,
      revenueChangeTotal: first.revenue > 0 ? safeDiv(last.revenue - first.revenue, first.revenue) : null
    };

    /* ---- burn & runway ---- */
    const trailing = rows.slice(-3);
    const netBurn3m = avg(trailing.map(r => r.netBurn));
    const grossBurn3m = avg(trailing.map(r => r.grossBurn));
    const profitable = netBurn3m <= 0;
    const runwayMonths = profitable ? Infinity : safeDiv(cashOnHand, netBurn3m);
    const burn = {
      grossBurn: grossBurn3m,
      netBurn: netBurn3m,
      netBurnLast: last.netBurn,
      profitable: profitable,
      runwayMonths: runwayMonths,
      runwayWeeks: isFinite(runwayMonths) ? runwayMonths * 4.345 : Infinity
    };

    /* ---- cash ---- */
    const cash = {
      cashOnHand: cashOnHand,
      opening: startCash,
      end: last.cumulativeCash,
      lowest: lowestCash,
      lowestLabel: lowestCashLabel,
      avgNetCashFlow: avg(rows.map(r => r.netCashFlow)),
      totalNetCashFlow: totalNetCF,
      negativeMonths: rows.filter(r => r.netCashFlow < 0).length
    };

    /* ---- break-even ---- */
    const cmRatio = safeDiv(totals.revenue - totals.variable, totals.revenue); // contribution margin ratio
    const fixedPerMonth = safeDiv(totals.fixed, n);
    const breakEvenRevenue = cmRatio > 0 ? fixedPerMonth / cmRatio : null;
    let breakEvenMonth = null;
    if (breakEvenRevenue != null) {
      const hit = rows.find(r => r.revenue >= breakEvenRevenue);
      breakEvenMonth = hit ? hit.pretty : null;
    }
    const breakEven = {
      contributionMarginRatio: cmRatio,
      fixedPerMonth: fixedPerMonth,
      breakEvenRevenue: breakEvenRevenue,
      breakEvenMonth: breakEvenMonth,
      monthsAbove: breakEvenRevenue != null ? rows.filter(r => r.revenue >= breakEvenRevenue).length : 0
    };

    /* ---- breakdowns ---- */
    const expMap = {};
    months.forEach(m => (m && Array.isArray(m.expenses) ? m.expenses : []).forEach(e => {
      const k = e.name || 'Unnamed';
      if (!expMap[k]) expMap[k] = { name: k, amount: 0, type: e.type };
      expMap[k].amount += e.amount;
    }));
    const expenseBreakdown = Object.values(expMap).sort((a, b) => b.amount - a.amount);
    expenseBreakdown.forEach(e => e.share = safeDiv(e.amount, totals.expenses));

    const revMap = {};
    months.forEach(m => (m && Array.isArray(m.revenue) ? m.revenue : []).forEach(r => {
      const k = r.name || 'Unnamed';
      if (!revMap[k]) revMap[k] = { name: k, amount: 0, category: r.category };
      revMap[k].amount += r.amount;
    }));
    const revenueBreakdown = Object.values(revMap).sort((a, b) => b.amount - a.amount);
    revenueBreakdown.forEach(r => r.share = safeDiv(r.amount, totals.revenue));

    const catMap = {};
    months.forEach(m => (m && Array.isArray(m.revenue) ? m.revenue : []).forEach(r => {
      const k = r.category || 'Other';
      catMap[k] = (catMap[k] || 0) + r.amount;
    }));
    const revenueByCategory = Object.keys(catMap).map(k => ({ category: k, amount: catMap[k], share: safeDiv(catMap[k], totals.revenue) })).sort((a, b) => b.amount - a.amount);

    const expenseByType = {
      fixed: totals.fixed, variable: totals.variable, oneoff: totals.oneoff,
      fixedShare: safeDiv(totals.fixed, totals.expenses),
      variableShare: safeDiv(totals.variable, totals.expenses),
      oneoffShare: safeDiv(totals.oneoff, totals.expenses)
    };

    /* ---- anomalies ---- */
    const anomalies = [];
    const medExp = median(rows.map(r => r.expenses));
    rows.forEach(r => {
      if (medExp > 0 && r.expenses > 1.5 * medExp) anomalies.push({ type: 'spike', severity: 'watch', label: r.pretty, detail: 'Expenses were ' + D.formatPct(r.expenses / medExp - 1, 0) + ' above the typical month.' });
    });
    for (let i = 1; i < rows.length; i++) {
      const p = rows[i - 1], r = rows[i];
      if (p.revenue > 0 && r.revenue < 0.7 * p.revenue) anomalies.push({ type: 'drop', severity: 'watch', label: r.pretty, detail: 'Revenue fell ' + D.formatPct(1 - r.revenue / p.revenue, 0) + ' versus the previous month.' });
    }
    const negMonths = rows.filter(r => r.netProfit < 0);
    if (negMonths.length) anomalies.push({ type: 'loss', severity: negMonths.length >= 3 ? 'critical' : 'watch', label: negMonths.length + ' month(s)', detail: 'Loss-making months: ' + negMonths.map(r => r.pretty).join(', ') + '.' });
    if (revenueBreakdown.length && revenueBreakdown[0].share > 0.5) anomalies.push({ type: 'concentration', severity: 'watch', label: revenueBreakdown[0].name, detail: 'One revenue stream is ' + D.formatPct(revenueBreakdown[0].share, 0) + ' of total revenue — concentration risk.' });
    if (cash.lowest < 0) anomalies.push({ type: 'cash', severity: 'critical', label: cash.lowestLabel, detail: 'Cash position dipped below zero.' });
    const revVol = safeDiv(stdev(rows.map(r => r.revenue)), averages.revenue);
    if (revVol > 0.25) anomalies.push({ type: 'volatility', severity: 'watch', label: 'Revenue volatility', detail: 'Monthly revenue swings ±' + D.formatPct(revVol, 0) + ' around its average.' });

    /* ---- health score ---- */
    const health = computeHealth({ averages, totals, burn, growth, rows, expenseByType, revVol });

    /* ---- trend ---- */
    const half = Math.max(1, Math.floor(n / 2));
    const recentRev = avg(rows.slice(-half).map(r => r.revenue));
    const priorRev = avg(rows.slice(0, half).map(r => r.revenue));
    const trend = {
      revenue: dir(recentRev, priorRev, 0.02),
      profit: dir(avg(rows.slice(-half).map(r => r.netProfit)), avg(rows.slice(0, half).map(r => r.netProfit)), 0.02)
    };

    return {
      empty: false, n: n,
      currency: (state.business && state.business.currency) || 'INR',
      businessName: (state.business && state.business.name) || 'Your business',
      months: rows,
      first: first, last: last,
      totals, avg: averages, growth, burn, cash, breakEven,
      expenseBreakdown, revenueBreakdown, revenueByCategory, expenseByType,
      anomalies, health, trend,
      revVol
    };
  }

  function dir(a, b, tol) {
    if (!isFinite(a) || !isFinite(b) || b === 0) return 'flat';
    const d = (a - b) / Math.abs(b);
    if (d > tol) return 'up';
    if (d < -tol) return 'down';
    return 'flat';
  }

  /* health score: weighted, transparent components (0-100 each) */
  function computeHealth(ctx) {
    const { averages, totals, burn, growth, rows, expenseByType, revVol } = ctx;

    // 1. Profitability — from average net margin
    const m = averages.netMargin;
    const profScore = clamp(mapLinear(m, -0.20, 0.25, 0, 100));

    // 2. Liquidity / runway
    let liqScore;
    if (burn.profitable) liqScore = 100;
    else {
      const r = burn.runwayMonths;
      if (!isFinite(r)) liqScore = 100;
      else if (r >= 12) liqScore = 100;
      else if (r >= 6) liqScore = mapLinear(r, 6, 12, 65, 100);
      else if (r >= 3) liqScore = mapLinear(r, 3, 6, 35, 65);
      else liqScore = clamp(mapLinear(r, 0, 3, 0, 35));
    }

    // 3. Growth — from revenue CAGR
    let growthScore;
    const g = growth.cagr;
    if (g == null) growthScore = 50;
    else growthScore = clamp(mapLinear(g, -0.10, 0.40, 0, 100));

    // 4. Cost control — expense growth vs revenue growth
    let costScore;
    const revGrowth = growth.revenueChangeTotal;
    const expGrowth = rows.length > 1 && rows[0].expenses > 0 ? (rows[rows.length - 1].expenses - rows[0].expenses) / rows[0].expenses : 0;
    if (revGrowth == null) costScore = 50;
    else {
      const spread = revGrowth - expGrowth; // positive = revenue outpacing costs
      costScore = clamp(mapLinear(spread, -0.30, 0.30, 0, 100));
    }

    // 5. Stability — lower volatility = better
    const stabScore = clamp(mapLinear(revVol, 0.30, 0.05, 0, 100));

    const components = [
      { key: 'profitability', label: 'Profitability', score: round(profScore, 0), weight: 0.25, detail: 'Avg net margin ' + D.formatPct(m) },
      { key: 'liquidity', label: 'Liquidity & runway', score: round(liqScore, 0), weight: 0.25, detail: burn.profitable ? 'Cash-flow positive' : (isFinite(burn.runwayMonths) ? D.formatMonths(burn.runwayMonths) + ' of runway' : 'Runway 120+ mo') },
      { key: 'growth', label: 'Growth', score: round(growthScore, 0), weight: 0.20, detail: g == null ? 'Not enough history' : 'Revenue CAGR ' + D.formatPct(g) },
      { key: 'cost', label: 'Cost control', score: round(costScore, 0), weight: 0.15, detail: 'Costs vs revenue growth' },
      { key: 'stability', label: 'Stability', score: round(stabScore, 0), weight: 0.15, detail: 'Revenue volatility ' + D.formatPct(revVol) }
    ];
    const score = Math.round(sum(components.map(c => c.score * c.weight)));
    const grade = score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : score >= 35 ? 'D' : 'E';
    return { score, grade, components };
  }

  function clamp(v) { return Math.max(0, Math.min(100, v)); }
  function mapLinear(v, inLo, inHi, outLo, outHi) {
    if (inHi === inLo) return outLo;
    const t = (v - inLo) / (inHi - inLo);
    return outLo + t * (outHi - outLo);
  }

  window.BPEngine = { compute, monthTotals, safeDiv, avg, sum, median, stdev };
})();
