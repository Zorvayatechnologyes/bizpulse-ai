# Audit & fix report — BizPulse AI

Scope: audit the existing app and fix real problems without rebuilding the design.
Everything below was implemented and, where possible, verified.

## 1. Problems fixed
- **Runtime crash on malformed data.** `compute()` and `monthTotals()` assumed every
  month had `revenue`/`expenses` arrays. A month missing them (e.g. from a hand-edited
  or third-party file) threw `Cannot read properties of undefined`. Found by the new
  test suite; now every access is guarded. `tests/engine.test.mjs` reproduces the old
  failure and now passes.
- **NaN / Infinity leaking into metrics.** Amounts are now coerced to finite numbers
  (`D.num`) before summing, and `safeDiv` returns 0 for non-finite inputs, so a bad
  value can no longer poison totals, margins, burn or runway.
- **Unsafe JSON import.** Import accepted any file with a `months` array and assigned
  it to app state unchecked. Now the file is size-limited (5 MB), parsed safely, and
  **validated + normalised**: months/line items are type-checked, amounts coerced,
  currency and expense types restricted to allow-lists, and all strings length-capped.
  Invalid files get a clear message instead of corrupting state.
- **AI calls could hang.** Provider requests had no timeout. Added a hard 30-second
  `AbortController` timeout (plus the existing retry/fallback) so a stalled provider
  cannot freeze the UI.
- **Accessibility gaps.** The nav had no landmark role or label, the active item had
  no `aria-current`, and status messages weren't announced. Added `role="navigation"`
  + label, `aria-current`, `role="status"`/`aria-live` on the toast and auth status,
  and labels on icon buttons.

## 2. Security improvements
- **Input validation on import** (shape, types, ranges, sizes) — the main new attack
  surface closed.
- **XSS confirmed safe:** every place user content is rendered goes through `esc()`;
  a scan found no unescaped `innerHTML` of user data. Nothing to fix, verified.
- **No secrets in the client:** the AI key lives only in the `ai-proxy` edge function;
  the frontend ships only the Supabase *publishable* key. Payment secrets likewise
  server-side only.
- **Passwords never stored in plaintext:** local mode stores a salted SHA-256 hash,
  not the password. (Backend auth is the intended production path — see limitations.)
- **Deterministic math kept separate from AI:** all financial figures are computed by
  the engine; the AI only interprets them.
- **File validation:** upload size and type are checked; JSON exports are validated.

## 3. Features added
- **Automated test suite** for the financial formulas — `tests/engine.test.mjs`,
  26 assertions covering core formulas, zero revenue, negative/one-off costs, and
  malformed/missing data. Run with `node tests/engine.test.mjs`.
- **Hardened JSON import** with clear error states and limits.
- **Accessibility pass** (landmarks, labels, live regions).
- **AI request timeout** with fallback.

## 4. Remaining limitations
- **Frontend still uses the device-local sign-in.** A real Supabase backend exists
  (schema + RLS + functions) but is **not yet wired into the UI**, so this is not yet
  "proper backend authentication" — that is the next step and needs live verification
  (the build sandbox cannot reach `supabase.co`).
- **No rate limiting** on the AI function (needs edge/gateway config).
- **No cloud sync in the UI** yet.
- Payments, Google/Apple sign-in and custom domain still need owner accounts/keys.
- Client-side gate is a convenience lock, not server-enforced protection.

## 5. Production-readiness score
**55 / 100** — honest breakdown:

| Area | Score | Note |
|---|---|---|
| Deterministic financial engine | 9/10 | Formulas correct; edge cases now handled and tested |
| Data validation & error handling | 8/10 | Import hardened; AI timeout/retry; states present |
| Security (client) | 6/10 | XSS-safe, no secrets shipped, but gate is client-side |
| Authentication | 4/10 | Backend built, **not wired**; still device-local in the UI |
| Accessibility | 7/10 | Landmarks/labels/live regions added; more audit possible |
| Responsive & performance | 8/10 | Fluid layout; SheetJS lazy-loaded; AI cached/batched |
| Backend & cloud sync | 5/10 | Schema + RLS + functions live; UI not connected |
| Payments / subscriptions | 3/10 | Function written; needs owner keys |

To reach ~80+, the single biggest lever is **wiring the frontend to the Supabase
backend** (real auth + cloud data), followed by payments and an admin dashboard.
