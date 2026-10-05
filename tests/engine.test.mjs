// ============================================================
// Automated tests for the deterministic financial engine.
// Run: node tests/engine.test.mjs
// Loads js/data.js + js/engine.js in a minimal shim and asserts the
// formulas and the edge cases (zero, negative, missing, malformed).
// ============================================================
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const js = path.join(dir, "..", "js");

globalThis.window = globalThis;
globalThis.document = { createElement: () => ({ setAttribute() {}, appendChild() {}, style: {} }), getElementById: () => null };

eval(fs.readFileSync(path.join(js, "data.js"), "utf8"));
eval(fs.readFileSync(path.join(js, "engine.js"), "utf8"));

const E = window.BPEngine;
const D = window.BPData;

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.log("  FAIL:", name); } }
function close(a, b, eps = 1e-9) { return Math.abs(a - b) < eps; }
function finite(v) { return typeof v === "number" && isFinite(v); }

const month = (label, rev, exp) => ({
  id: label, label,
  revenue: rev.map(([name, amount]) => ({ id: name, name, amount, category: "Product" })),
  expenses: exp.map(([name, amount, type]) => ({ id: name, name, amount, type: type || "fixed" })),
});

// ---- monthTotals: core formulas ----
{
  const t = E.monthTotals(month("2025-01", [["Sales", 1000]], [["Rent", 300, "fixed"], ["COGS", 400, "variable"]]));
  ok("revenue = 1000", t.revenue === 1000);
  ok("expenses = 700", t.expenses === 700);
  ok("grossProfit = 600 (revenue - variable)", t.grossProfit === 600);
  ok("netProfit = 300", t.netProfit === 300);
  ok("grossMargin = 0.6", close(t.grossMargin, 0.6));
  ok("netMargin = 0.3", close(t.netMargin, 0.3));
}

// ---- safeDiv edge cases ----
{
  ok("safeDiv by zero = 0", E.safeDiv(5, 0) === 0);
  ok("safeDiv NaN numerator = 0", E.safeDiv(NaN, 2) === 0);
  ok("safeDiv Infinity = 0", E.safeDiv(Infinity, 2) === 0);
  ok("safeDiv normal", close(E.safeDiv(10, 4), 2.5));
}

// ---- zero revenue must not produce NaN margins ----
{
  const t = E.monthTotals(month("2025-01", [], [["Rent", 100, "fixed"]]));
  ok("zero revenue -> revenue 0", t.revenue === 0);
  ok("zero revenue -> finite margin", finite(t.netMargin) && finite(t.grossMargin));
}

// ---- malformed / missing data must not throw or return NaN ----
{
  let threw = false, t;
  try { t = E.monthTotals({ label: "x" }); } catch (e) { threw = true; }
  ok("monthTotals(no arrays) does not throw", !threw);
  ok("monthTotals(no arrays) revenue 0", t && t.revenue === 0);
  ok("monthTotals(no arrays) finite", t && finite(t.expenses) && finite(t.netMargin));

  const bad = E.monthTotals(month("2025-01", [["Sales", "not-a-number"]], [["Rent", null, "fixed"]]));
  ok("string/null amounts -> finite totals", finite(bad.revenue) && finite(bad.expenses));
  ok("string/null amounts -> 0", bad.revenue === 0 && bad.expenses === 0);
}

// ---- compute: empty state ----
{
  const m = E.compute({ months: [] });
  ok("empty state flagged", m.empty === true);
  ok("empty has no months", Array.isArray(m.months) && m.months.length === 0);
}

// ---- compute: multi-month, malformed-safe, finite everywhere ----
{
  const state = {
    cashOnHand: 500000,
    business: { currency: "INR", name: "T" },
    months: [
      month("2025-01", [["Sales", 1000000]], [["Rent", 300000, "fixed"], ["COGS", 400000, "variable"]]),
      month("2025-02", [["Sales", 900000]], [["Rent", 300000, "fixed"], ["COGS", 450000, "variable"]]),
      { id: "bad", label: "2025-03" }, // missing arrays on purpose
    ],
  };
  let threw = false, m;
  try { m = E.compute(state); } catch (e) { threw = true; console.log("   threw:", e.message); }
  ok("compute(mixed data) does not throw", !threw);
  ok("compute n = 3", m && m.n === 3);
  ok("total revenue finite", m && finite(m.totals.revenue));
  ok("avg net margin finite", m && finite(m.avg.netMargin));
  ok("burn.netBurn finite", m && finite(m.burn.netBurn));
  ok("runway finite or Infinity", m && (finite(m.burn.runwayMonths) || m.burn.runwayMonths === Infinity));
  ok("health score 0..100", m && m.health.score >= 0 && m.health.score <= 100);
}

console.log(`\nengine tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
