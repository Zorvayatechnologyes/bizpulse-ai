/* ============================================================
   BizPulse AI — agent layer
   Seven specialist agents. Each reads the metrics engine output,
   produces deterministic findings + recommendations + a built-in
   narrative, and exposes structured facts for the optional LLM.
   Exposes: window.BPAgents.run(metrics)
   ============================================================ */
(function () {
  const D = window.BPData;
  const E = window.BPEngine;

  function money(v, cur) { return D.formatMoney(v, cur, 'compact'); }
  function pct(v) { return D.formatPct(v); }

  function sevRank(s) { return s === 'critical' ? 3 : s === 'watch' ? 2 : 1; }
  function worst(list) { return list.reduce((a, b) => sevRank(b) > sevRank(a) ? b : a, 'good'); }
  function mos(n) { return n + (n === 1 ? ' month' : ' months'); }

  /* ================= SPECIALISTS ================= */
  const AGENTS = [

    /* ---------- 1. Profit Analyst ---------- */
    {
      id: 'profit', name: 'Profit Analyst', role: 'Margins & profitability', icon: '📈', color: '#BDD7D8',
      blurb: 'Tracks your profit rate, gross and net margins, and where profit is leaking.',
      keywords: ['profit', 'margin', 'profitability', 'gross', 'net', 'earn'],
      analyze(m) {
        const cur = m.currency;
        const avgNet = m.avg.netMargin;
        const avgGross = m.totals.grossMargin;
        const lossMonths = m.months.filter(r => r.netProfit < 0);
        const best = m.months.slice().sort((a, b) => b.netMargin - a.netMargin)[0];
        const worstM = m.months.slice().sort((a, b) => a.netMargin - b.netMargin)[0];

        let severity = 'good';
        if (avgNet < -0.05 || lossMonths.length >= 3) severity = 'critical';
        else if (avgNet < 0.05 || lossMonths.length > 0) severity = 'watch';

        const findings = [
          { severity: avgNet < 0 ? 'critical' : avgNet < 0.08 ? 'watch' : 'good',
            title: 'Average net profit margin', num: pct(avgNet),
            detail: 'You keep ' + pct(avgNet) + ' of every rupee of revenue as profit, on average across ' + m.n + ' months.' },
          { severity: avgGross < 0.35 ? 'watch' : 'good',
            title: 'Gross margin', num: pct(avgGross),
            detail: 'After variable costs (cost of revenue), gross margin is ' + pct(avgGross) + '. This is what funds fixed costs.' },
          { severity: lossMonths.length ? 'watch' : 'good',
            title: 'Loss-making months', num: String(lossMonths.length) + ' of ' + m.n,
            detail: lossMonths.length ? 'Loss months: ' + lossMonths.map(r => r.pretty).join(', ') + '.' : 'Every month was profitable.' }
        ];

        const recommendations = [];
        if (avgNet < 0.05) recommendations.push('Raise prices on your lowest-margin products or renegotiate supplier terms — a 2–3% price lift flows almost entirely to profit.');
        if (avgGross < 0.4) recommendations.push('Review variable costs (cost of goods): they are consuming ' + pct(1 - avgGross) + ' of revenue before fixed costs are even paid.');
        if (lossMonths.length) recommendations.push('Investigate ' + worstM.pretty + ' (net margin ' + pct(worstM.netMargin) + ') and decide whether to fix or exit the activity behind it.');
        recommendations.push('Protect the ' + best.pretty + ' playbook — that month produced your best margin at ' + pct(best.netMargin) + '.');

        const narrative =
          'Across the last ' + mos(m.n) + ', ' + m.businessName + ' averaged a net profit margin of ' + pct(avgNet) +
          ', turning ' + money(m.avg.revenue, cur) + ' of monthly revenue into ' + money(m.avg.netProfit, cur) + ' of net profit. ' +
          'Gross margin sits at ' + pct(avgGross) + ', which means variable costs absorb ' + pct(1 - avgGross) + ' of sales before fixed overheads. ' +
          (lossMonths.length
            ? (lossMonths.length === 1 ? 'One of those months was loss-making (' + worstM.pretty + ', ' + pct(worstM.netMargin) + '). ' : lossMonths.length + ' of those months were loss-making, with ' + worstM.pretty + ' the weakest at ' + pct(worstM.netMargin) + '. ')
            : 'Every month was profitable, a solid foundation. ') +
          (avgNet < 0.05
            ? 'A margin below 5% leaves little cushion: small cost shocks can push you into loss, so pricing and cost discipline are the priority.'
            : 'Margins are healthy enough to absorb normal shocks.');

        return {
          severity, findings, recommendations,
          chips: [
            { label: 'Avg net margin', value: pct(avgNet) },
            { label: 'Gross margin', value: pct(avgGross) },
            { label: 'Avg monthly profit', value: money(m.avg.netProfit, cur) },
            { label: 'Loss months', value: lossMonths.length + '/' + m.n }
          ],
          facts: {
            avg_net_margin: pct(avgNet), avg_gross_margin: pct(avgGross),
            avg_monthly_profit: money(m.avg.netProfit, cur), avg_monthly_revenue: money(m.avg.revenue, cur),
            loss_months: lossMonths.length, total_months: m.n
          },
          focus: 'profitability: profit rate, gross and net margins, and where profit is leaking',
          narrative
        };
      }
    },

    /* ---------- 2. Burn & Runway ---------- */
    {
      id: 'burn', name: 'Burn & Runway Analyst', role: 'Cash burn & runway', icon: '🔥', color: '#F7CBCA',
      blurb: 'Measures how fast you are spending, net of revenue, and how many months of cash remain.',
      keywords: ['burn', 'runway', 'months left', 'spend', 'survive', 'out of cash'],
      analyze(m) {
        const cur = m.currency;
        const b = m.burn;
        let severity;
        if (b.profitable) severity = 'good';
        else if (!isFinite(b.runwayMonths) || b.runwayMonths >= 12) severity = 'good';
        else if (b.runwayMonths >= 6) severity = 'watch';
        else severity = 'critical';

        const findings = [
          { severity: 'info', title: 'Gross monthly burn', num: money(b.grossBurn, cur),
            detail: 'Total monthly spend (all expenses), averaged over the last 3 months.' },
          { severity: b.profitable ? 'good' : (b.netBurn > 0 ? 'watch' : 'good'),
            title: 'Net monthly burn', num: money(b.netBurn, cur),
            detail: b.profitable ? 'You are cash-flow positive — revenue covers all spending.' : 'Spending exceeds revenue by ' + money(b.netBurn, cur) + ' per month on average.' },
          { severity,
            title: 'Runway', num: b.profitable ? 'Profitable' : D.formatMonths(b.runwayMonths),
            detail: b.profitable ? 'No burn, so runway is not a constraint while this holds.'
              : 'Cash of ' + money(m.cash.cashOnHand, cur) + ' divided by net burn of ' + money(b.netBurn, cur) + '/month.' }
        ];

        const recommendations = [];
        if (!b.profitable && isFinite(b.runwayMonths) && b.runwayMonths < 12) {
          recommendations.push('At the current net burn you have about ' + D.formatMonths(b.runwayMonths) + ' of runway — start planning a raise, cost reduction, or revenue push now, not at ' + Math.max(1, Math.round(b.runwayMonths / 2)) + ' months left.');
          recommendations.push('Model the effect of cutting ' + money(b.netBurn * 0.2, cur) + '/month (20% of net burn): it extends runway by roughly ' + D.formatMonths((m.cash.cashOnHand / Math.max(1, b.netBurn * 0.8)) - b.runwayMonths) + '.');
        } else if (b.profitable) {
          recommendations.push('Keep net burn negative by holding costs below revenue; bank the surplus as a buffer for slow months.');
        }
        recommendations.push('Focus cuts on the largest discretionary line first — see the Cost Optimisation agent.');

        const narrative = b.profitable
          ? m.businessName + ' is currently cash-flow positive: revenue exceeds total spending by about ' + money(Math.abs(b.netBurn), cur) + ' per month, so there is no burn to fund. Gross monthly spend averages ' + money(b.grossBurn, cur) + '. The priority is to protect this position — keep the cost base flexible and build a cash buffer for seasonal dips.'
          : m.businessName + ' is burning about ' + money(b.netBurn, cur) + ' of net cash per month (gross spend ' + money(b.grossBurn, cur) + '). Against ' + money(m.cash.cashOnHand, cur) + ' of cash on hand, that is roughly ' + D.formatMonths(b.runwayMonths) + ' of runway. ' +
            (severity === 'critical'
              ? 'That is a tight window. Fundraising, a serious cost reduction, or a fast revenue lift should begin immediately.'
              : 'That is workable but worth watching closely; the trend matters more than the level.');

        return {
          severity, findings, recommendations,
          chips: [
            { label: 'Net burn / mo', value: money(b.netBurn, cur) },
            { label: 'Gross burn / mo', value: money(b.grossBurn, cur) },
            { label: 'Runway', value: b.profitable ? 'Positive' : D.formatMonths(b.runwayMonths) },
            { label: 'Cash on hand', value: money(m.cash.cashOnHand, cur) }
          ],
          facts: {
            net_burn_monthly: money(b.netBurn, cur), gross_burn_monthly: money(b.grossBurn, cur),
            runway: b.profitable ? 'cash-flow positive (no burn)' : D.formatMonths(b.runwayMonths),
            cash_on_hand: money(m.cash.cashOnHand, cur)
          },
          focus: 'cash burn and runway — how long the current cash lasts',
          narrative
        };
      }
    },

    /* ---------- 3. Cash Flow Analyst ---------- */
    {
      id: 'cash', name: 'Cash Flow Analyst', role: 'Money flow & liquidity', icon: '💧', color: '#D5E5E5',
      blurb: 'Watches money in versus money out, timing, and your lowest cash point.',
      keywords: ['cash', 'flow', 'liquidity', 'money flow', 'in and out', 'buffer'],
      analyze(m) {
        const cur = m.currency;
        const c = m.cash;
        const negMonths = c.negativeMonths;
        let severity = 'good';
        if (c.lowest < 0) severity = 'critical';
        else if (negMonths > m.n / 2 || (c.avgNetCashFlow < 0)) severity = 'watch';

        const findings = [
          { severity: 'info', title: 'Average net cash flow', num: money(c.avgNetCashFlow, cur) + '/mo',
            detail: 'Revenue minus expenses, averaged across all months.' },
          { severity: negMonths ? 'watch' : 'good', title: 'Months with negative cash flow', num: negMonths + ' of ' + m.n,
            detail: negMonths ? 'In those months, spending outran income.' : 'Income covered spending every month.' },
          { severity: c.lowest < 0 ? 'critical' : 'info', title: 'Lowest cash point', num: money(c.lowest, cur),
            detail: 'Reached around ' + c.lowestLabel + '. This is the tightest the bank balance got.' }
        ];

        const recommendations = [];
        if (negMonths) recommendations.push('Smooth timing: ask suppliers for longer terms or bill customers earlier to avoid the months where outflow beats inflow.');
        recommendations.push('Hold a liquidity buffer of at least ' + money(Math.max(m.avg.expenses, m.cash.cashOnHand * 0.15), cur) + ' to cover a slow month without borrowing.');
        if (c.lowest < 0) recommendations.push('Your cash dipped below zero at ' + c.lowestLabel + ' — arrange a short-term credit line before it is needed, not after.');

        const narrative = 'Cash flow tells the story behind profit. ' + m.businessName + ' takes in ' + money(m.avg.revenue, cur) +
          ' and pays out ' + money(m.avg.expenses, cur) + ' in a typical month, for an average net cash flow of ' + money(c.avgNetCashFlow, cur) + '. ' +
          (negMonths ? negMonths + ' months ended cash-negative, which is a timing and cushioning problem as much as a profitability one. ' : 'Every month was cash-positive. ') +
          'The lowest point was ' + money(c.lowest, cur) + ' around ' + c.lowestLabel + '. ' +
          (c.lowest < 0 ? 'Dipping below zero is a genuine liquidity risk that needs a credit line or faster collections.' : 'The balance never went negative, so liquidity is under control.');

        return {
          severity, findings, recommendations,
          chips: [
            { label: 'Avg net cash flow', value: money(c.avgNetCashFlow, cur) },
            { label: 'Negative months', value: negMonths + '/' + m.n },
            { label: 'Lowest cash', value: money(c.lowest, cur) },
            { label: 'Opening cash', value: money(c.opening, cur) }
          ],
          facts: {
            avg_net_cash_flow: money(c.avgNetCashFlow, cur) + '/month',
            negative_cash_months: negMonths, lowest_cash_point: money(c.lowest, cur) + ' (' + c.lowestLabel + ')'
          },
          focus: 'cash flow — money in, money out, timing and liquidity risk',
          narrative
        };
      }
    },

    /* ---------- 4. Revenue Growth Analyst ---------- */
    {
      id: 'growth', name: 'Revenue Growth Analyst', role: 'Growth & revenue mix', icon: '🚀', color: '#DDD3D3',
      blurb: 'Measures growth rate, momentum and concentration across your revenue streams.',
      keywords: ['growth', 'revenue', 'sales', 'cagr', 'grow', 'stream', 'mix'],
      analyze(m) {
        const cur = m.currency;
        const g = m.growth;
        const top = m.revenueBreakdown[0];
        let severity = 'good';
        if (g.cagr != null && g.cagr < 0) severity = 'critical';
        else if (g.cagr != null && g.cagr < 0.1) severity = 'watch';
        if (top && top.share > 0.6) severity = worst([severity, 'watch']);

        const findings = [
          { severity: (g.cagr == null ? 'info' : g.cagr < 0 ? 'critical' : g.cagr < 0.1 ? 'watch' : 'good'),
            title: 'Revenue growth (CAGR)', num: g.cagr == null ? 'n/a' : pct(g.cagr),
            detail: g.cagr == null ? 'Not enough months to annualise.' : 'Annualised growth from ' + money(g.firstRevenue, cur) + ' to ' + money(g.lastRevenue, cur) + ' per month.' },
          { severity: 'info', title: 'Average month-on-month growth', num: g.momAvg == null ? 'n/a' : pct(g.momAvg),
            detail: 'The typical monthly change in revenue.' },
          { severity: top && top.share > 0.5 ? 'watch' : 'good', title: 'Largest revenue stream', num: top ? top.name + ' · ' + pct(top.share) : '—',
            detail: top ? 'Concentration above 50% means a single stream can move the whole business.' : 'No revenue streams recorded.' }
        ];

        const recommendations = [];
        if (g.cagr != null && g.cagr < 0.1) recommendations.push('Revenue growth is slow — double down on the stream with the best growth and margin, and set a clear monthly target.');
        if (top && top.share > 0.5) recommendations.push('Reduce concentration risk: grow a second stream to below 50% of revenue so one client or product cannot sink you.');
        recommendations.push('Track the leading indicator for your best channel — pipeline, repeat rate or order volume — not just the revenue result.');

        const narrative = m.businessName + ' has ' + (g.cagr == null ? 'insufficient history to annualise growth' :
          'grown revenue at an annualised rate of ' + pct(g.cagr) + ', from ' + money(g.firstRevenue, cur) + ' to ' + money(g.lastRevenue, cur) + ' per month') + '. ' +
          (top ? 'The largest stream, ' + top.name + ', contributes ' + pct(top.share) + ' of revenue' + (top.share > 0.5 ? ' — a concentration worth reducing.' : '. ') : '') +
          (g.cagr != null && g.cagr < 0 ? ' Revenue is contracting, which puts pressure on every other metric.' :
            g.cagr != null && g.cagr < 0.1 ? ' Growth is modest; the priority is lifting the top line.' : ' Momentum is positive — the job now is to keep it sustainable.');

        return {
          severity, findings, recommendations,
          chips: [
            { label: 'Revenue CAGR', value: g.cagr == null ? 'n/a' : pct(g.cagr) },
            { label: 'Avg MoM growth', value: g.momAvg == null ? 'n/a' : pct(g.momAvg) },
            { label: 'Latest revenue', value: money(g.lastRevenue, cur) },
            { label: 'Streams', value: String(m.revenueBreakdown.length) }
          ],
          facts: {
            revenue_cagr: g.cagr == null ? 'n/a' : pct(g.cagr),
            avg_mom_growth: g.momAvg == null ? 'n/a' : pct(g.momAvg),
            latest_monthly_revenue: money(g.lastRevenue, cur),
            largest_stream: top ? top.name + ' (' + pct(top.share) + ')' : 'n/a'
          },
          focus: 'revenue growth, momentum and revenue-stream concentration',
          narrative
        };
      }
    },

    /* ---------- 5. Cost Optimisation Analyst ---------- */
    {
      id: 'cost', name: 'Cost Optimisation Analyst', role: 'Spending & efficiency', icon: '✂️', color: '#C9D8D8',
      blurb: 'Finds your biggest cost drivers and where savings can be made safely.',
      keywords: ['cost', 'expense', 'spend', 'save', 'cut', 'reduce', 'overhead'],
      analyze(m) {
        const cur = m.currency;
        const top = m.expenseBreakdown.slice(0, 3);
        const et = m.expenseByType;
        let severity = 'good';
        if (et.oneoffShare > 0.12) severity = 'watch';
        if (m.totals.netMargin < 0) severity = 'critical';

        const findings = top.map((e, i) => ({
          severity: i === 0 ? 'watch' : 'info',
          title: 'Cost driver #' + (i + 1) + ': ' + e.name,
          num: money(e.amount, cur) + ' · ' + pct(e.share),
          detail: 'Accounts for ' + pct(e.share) + ' of total spend (' + money(e.amount, cur) + ' over ' + m.n + ' months).'
        }));
        findings.push({
          severity: et.fixedShare > 0.6 ? 'watch' : 'good',
          title: 'Fixed vs variable split', num: pct(et.fixedShare) + ' fixed',
          detail: pct(et.fixedShare) + ' of costs are fixed. The higher this is, the less you can flex when revenue dips.'
        });

        const recommendations = [];
        if (top[0]) recommendations.push('Start with ' + top[0].name + ': even a 10% reduction saves about ' + money(top[0].amount / m.n * 0.1, cur) + ' per month.');
        if (et.fixedShare > 0.55) recommendations.push('Your cost base is mostly fixed — convert some of it to variable (contractors, usage-based tools) to lower risk.');
        if (et.oneoffShare > 0.1) recommendations.push('One-off costs are ' + pct(et.oneoffShare) + ' of spend; budget these deliberately rather than letting them surprise your cash flow.');
        recommendations.push('Set a quarterly review of your top three cost lines against revenue growth.');

        const narrative = 'The largest cost line is ' + (top[0] ? top[0].name + ' at ' + money(top[0].amount, cur) + ' (' + pct(top[0].share) + ' of spend)' : 'not recorded') + '. ' +
          'Overall, ' + pct(et.fixedShare) + ' of costs are fixed and ' + pct(et.variableShare) + ' vary with activity' + (et.oneoffShare > 0.005 ? ', plus ' + pct(et.oneoffShare) + ' one-off' : '') + '. ' +
          (et.fixedShare > 0.55 ? 'A heavy fixed base makes the business less resilient to a slow quarter. ' : 'A reasonably flexible cost base gives you room to react. ') +
          (m.totals.netMargin < 0 ? 'Because the business is loss-making, cost control is urgent rather than optional.' : 'There is scope to trim without harming operations.');

        return {
          severity, findings, recommendations,
          chips: [
            { label: 'Total spend', value: money(m.totals.expenses, cur) },
            { label: 'Fixed share', value: pct(et.fixedShare) },
            { label: 'Top cost', value: top[0] ? top[0].name : '—' },
            { label: 'One-off share', value: pct(et.oneoffShare) }
          ],
          facts: {
            total_spend: money(m.totals.expenses, cur), fixed_share: pct(et.fixedShare),
            variable_share: pct(et.variableShare), largest_cost_line: top[0] ? top[0].name + ' (' + pct(top[0].share) + ')' : 'n/a'
          },
          focus: 'cost structure — biggest cost drivers and realistic savings',
          narrative
        };
      }
    },

    /* ---------- 6. Risk & Anomaly Analyst ---------- */
    {
      id: 'risk', name: 'Risk & Anomaly Analyst', role: 'Red flags & volatility', icon: '🛡️', color: '#E6C6C4',
      blurb: 'Scans for unusual months, volatility and dependency risks before they bite.',
      keywords: ['risk', 'anomaly', 'unusual', 'volatility', 'red flag', 'spike', 'danger'],
      analyze(m) {
        const cur = m.currency;
        const a = m.anomalies;
        const crit = a.filter(x => x.severity === 'critical');
        let severity = crit.length ? 'critical' : (a.length ? 'watch' : 'good');

        const findings = a.length
          ? a.slice(0, 5).map(x => ({ severity: x.severity, title: x.label, detail: x.detail }))
          : [{ severity: 'good', title: 'No anomalies detected', detail: 'Revenue, costs and margins stayed within normal ranges across all months.' }];
        findings.push({
          severity: m.revVol > 0.25 ? 'watch' : 'good',
          title: 'Revenue volatility',
          num: pct(m.revVol),
          detail: 'Monthly revenue varies by ±' + pct(m.revVol) + ' around its average — high volatility makes planning harder.'
        });

        const recommendations = [];
        if (crit.length) recommendations.push('Address the critical flags first: ' + crit.map(x => x.label).join(', ') + '.');
        if (a.some(x => x.type === 'concentration')) recommendations.push('Diversify away from your dominant revenue stream to reduce single-point dependency.');
        if (a.some(x => x.type === 'spike')) recommendations.push('Review the expense-spike months to confirm whether they were planned one-offs or runaway costs.');
        recommendations.push('Add a monthly variance check: flag any line more than 20% away from its usual value.');

        const narrative = a.length
          ? 'The risk scan found ' + a.length + ' item' + (a.length > 1 ? 's' : '') + ' worth attention' + (crit.length ? ', including ' + crit.length + ' critical' : '') + '. ' +
            a.slice(0, 3).map(x => x.label + ' — ' + x.detail).join(' ') +
            ' Revenue volatility is ' + pct(m.revVol) + ', so month-to-month planning needs a buffer.'
          : 'The risk scan came back clean: no unusual expense spikes, revenue drops, cash dips or concentration issues were detected across the period. Revenue volatility is ' + pct(m.revVol) + ', which is manageable. Keep monitoring so early warnings stay visible.';

        return {
          severity, findings, recommendations,
          chips: [
            { label: 'Flags', value: String(a.length) },
            { label: 'Critical', value: String(crit.length) },
            { label: 'Revenue volatility', value: pct(m.revVol) },
            { label: 'Health score', value: String(m.health.score) + '/100' }
          ],
          facts: {
            anomaly_count: a.length, critical_flags: crit.length,
            revenue_volatility: pct(m.revVol), flags: a.slice(0, 5).map(x => x.label + ': ' + x.detail).join(' | ') || 'none'
          },
          focus: 'risks, anomalies, volatility and dependency red flags',
          narrative
        };
      }
    }
  ];

  /* ================= ORCHESTRATOR ================= */
  function orchestrator(m, specialistResults) {
    const cur = m.currency;
    const h = m.health;
    const sev = worst(specialistResults.map(r => r.severity));
    const crit = specialistResults.filter(r => r.severity === 'critical');
    const watch = specialistResults.filter(r => r.severity === 'watch');

    // priority actions: take top recommendation from critical agents, then watch agents
    const priorities = [];
    crit.forEach(r => { if (r.recommendations[0]) priorities.push({ agent: r.name, text: r.recommendations[0] }); });
    watch.forEach(r => { if (r.recommendations[0] && priorities.length < 5) priorities.push({ agent: r.name, text: r.recommendations[0] }); });
    if (!priorities.length) priorities.push({ agent: 'CFO', text: 'Hold the current course: the fundamentals are sound. Keep monitoring margins, runway and cash monthly.' });

    const gradeWord = h.grade === 'A' ? 'strong' : h.grade === 'B' ? 'healthy' : h.grade === 'C' ? 'mixed' : h.grade === 'D' ? 'fragile' : 'distressed';

    const findings = [
      { severity: sev === 'critical' ? 'critical' : sev === 'watch' ? 'watch' : 'good',
        title: 'Overall business health', num: h.score + '/100 · Grade ' + h.grade,
        detail: 'Weighted from profitability, liquidity, growth, cost control and stability.' }
    ];
    h.components.forEach(c => findings.push({ severity: c.score >= 65 ? 'good' : c.score >= 45 ? 'watch' : 'critical', title: c.label, num: c.score + '/100', detail: c.detail }));

    const recommendations = priorities.map(p => '[' + p.agent + '] ' + p.text);

    const narrative = m.businessName + ' scores ' + h.score + '/100 (Grade ' + h.grade + ') — a ' + gradeWord + ' position. ' +
      'The overall read: ' + (crit.length ? crit.length + ' area(s) need urgent attention' : watch.length ? watch.length + ' area(s) to watch' : 'no critical issues, but stay disciplined') + '. ' +
      'Profitability scores ' + h.components[0].score + '/100, liquidity ' + h.components[1].score + '/100, growth ' + h.components[2].score + '/100. ' +
      'The single most important next move: ' + priorities[0].text;

    return {
      id: 'cfo', name: 'CFO Orchestrator', role: 'Lead agent · synthesis', icon: '🧭', color: '#4B5757',
      blurb: 'Reads every specialist agent and produces one prioritised plan plus an overall health score.',
      isOrchestrator: true,
      severity: sev,
      score: h.score, grade: h.grade, components: h.components,
      findings, recommendations, priorities,
      chips: [
        { label: 'Health score', value: h.score + '/100' },
        { label: 'Grade', value: h.grade },
        { label: 'Critical areas', value: String(crit.length) },
        { label: 'Watch areas', value: String(watch.length) }
      ],
      facts: {
        health_score: h.score + '/100', grade: h.grade,
        critical_areas: crit.map(r => r.name).join(', ') || 'none',
        watch_areas: watch.map(r => r.name).join(', ') || 'none',
        components: h.components.map(c => c.label + ' ' + c.score + '/100').join(', ')
      },
      focus: 'the overall business health and a prioritised action plan',
      narrative
    };
  }

  function run(m) {
    if (!m || m.empty) return { specialists: [], orchestrator: null };
    const specialists = AGENTS.map(a => Object.assign({ id: a.id, name: a.name, role: a.role, icon: a.icon, color: a.color, blurb: a.blurb, keywords: a.keywords }, a.analyze(m)));
    const orch = orchestrator(m, specialists);
    return { specialists, orchestrator: orch, all: specialists.concat([orch]) };
  }

  window.BPAgents = { run, AGENTS };
})();
