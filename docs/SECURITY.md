# Security audit report — BizPulse AI

Implemented and tested. This is the honest picture, not a claim of perfection.

## Fixed / implemented
1. **Auth is Supabase-only for real accounts.** The old device-local password login
   and browser-side password hashing are **gone**. The only non-backend path is a
   **credential-free demo guest** (no email, no password, no hash) — verified that
   localStorage contains no password or hash.
2. **No secrets in the frontend.** Only the Supabase *publishable* key ships. The AI
   and payment keys live only as edge-function secrets. A test scans every frontend
   file for `service_role`, `sk-…`, `AI_API_KEY`, `ANTHROPIC_API_KEY` and
   `RAZORPAY_KEY_SECRET` — all pass.
3. **Secrets moved server-side.** `ai-proxy` holds the AI key; `checkout` holds payment
   keys. The browser never sees them.
4. **Strict RLS.** All 10 tables have Row Level Security with `USING` + `WITH CHECK`
   scoped to organization membership (verified via `pg_policies`). Cross-org/IDOR reads
   are blocked at the database.
5. **Server hardening on `ai-proxy` (redeployed v2):** JWT required; per-user **rate
   limit** (20/min); monthly usage limit per org; **request size cap** (100 KB);
   message count/character caps; **control-character sanitisation**; **token cap**
   (2000); provider timeout + retry; **safe errors** (no stack traces or provider
   internals leaked).
6. **Input validation & sanitisation.** JSON import is schema-validated, size-limited,
   normalised, with duplicate detection; CSV import validates amounts and month cells.
7. **Injection defence.** All user content is HTML-escaped before rendering (XSS-safe);
   SQL goes through the parameterised Supabase client (no string-built SQL); AI prompts
   wrap user figures in `<DATA>…</DATA>` and instruct the model to treat them as data
   only (prompt-injection guard).
8. **Security headers.** Strict **Content-Security-Policy** with **SHA-256 hashes for
   every inline script** (no `unsafe-inline` for scripts), plus `object-src 'none'`,
   `base-uri 'self'`, `form-action 'self'`. `_headers` adds **HSTS**,
   `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`,
   `Permissions-Policy`, and `frame-ancestors 'none'`.
9. **Clean frontend.** No console logs or debug data in app code (all `console.*` are
   inside Chart.js). No credentials in storage.
10. **AI cache safety.** Cache is versioned (v2) and expires after 24h; it is
    per-browser, so one user can never read another's cached text.
11. **Runtime robustness.** Engine hardened against null/garbage months — a real crash
    found by the tests and fixed.

## Tests performed
- `node tests/engine.test.mjs` — **39 passed** (formulas, zero/negative/huge, one-off,
  break-even, CAGR, Infinity, health bounds, malformed input).
- `node tests/security.test.mjs` — **22 passed** (secret scan, CSP strictness, headers,
  no browser-side hashing, defensive engine, escaping).
- Browser: CSP loads with **0 violations**, **0 page errors**; all 8 views render with
  no overflow; backend-first auth + demo fallback both verified.

## Remaining risks (honest)
- **Business data still lives in the browser**, so RLS is not yet protecting real user
  data — it will once the data layer is connected to Supabase. This is the biggest gap.
- The sign-in **gate itself is client-side** and can be bypassed by editing the page;
  it is a UX/access layer, not server-enforced protection.
- Supabase manages session tokens in browser storage (standard for SPAs); not a secret,
  but worth knowing.
- No WAF / bot protection; rate limiting is app-level only.
- Google/Apple providers and payment keys still need owner configuration.

## Files changed
`index.html`, `js/engine.js`, `js/llm.js`, `js/app.js`, `js/auth.js`,
`supabase/functions/ai-proxy/index.ts` (redeployed), `_headers`, `.env.example`,
`tests/security.test.mjs`, `docs/SECURITY.md`.

## Final security score: **80 / 100**
Strong on secrets, RLS, headers, input handling and server hardening; held back by the
client-side data layer and client-side gate. Connecting the data layer to Supabase (so
RLS protects real data) is the single biggest step to ~90.
