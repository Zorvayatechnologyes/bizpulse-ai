# Production-readiness scorecard (latest)

Honest, re-scored after this pass. Supersedes earlier scores in AUDIT.md.

| Area | First audit | Prev | Now | Why |
|---|---|---|---|---|
| Deterministic financial engine | 9 | 9 | **10** | Edge cases covered (zero, negative, huge, one-off, break-even, CAGR, Infinity) + 39 tests |
| Data validation & error handling | 8 | 8 | **9** | Import schema validation **+ duplicate detection** + backup/restore (export/import) |
| Security (client) | 6 | 7 | **8** | **No passwords or hashes stored at all**; demo is a credential-free guest; secrets policy documented (`.env.example`) |
| Authentication | 4 | 8 | **7** | Real Supabase auth is primary; **untested against the live backend** from the build sandbox, so held at 7 |
| Accessibility | 7 | 7 | **8** | Landmarks, labels, live regions, AI-vs-calculated labelling, keyboard sign-in |
| Responsive & performance | 8 | 8 | **8** | Fluid layout; lazy SheetJS; cached/batched AI |
| Backend & cloud sync | 5 | 7 | **7** | Backend wired into auth; **UI cloud data sync still pending** |
| Payments / subscriptions | 3 | 6 | **6** | Plans + usage meter + server checkout; needs owner keys |

**Overall: 55 → 72 → 78 / 100**

## What changed this pass
- **Runway shows "N/A — cash-flow positive — runway not applicable"** instead of "Unlimited"/Infinity.
- **No credential storage:** the demo path is now a **credential-free guest** (no email, no
  password, no hash) — verified that localStorage holds no password/hash. Real sign-in
  uses Supabase Auth.
- **Import duplicate detection** (identical rows are skipped and reported) plus the
  earlier schema validation, size limits and safe errors.
- **AI vs calculated labelling** on the agents view.
- **Production config**: `.env.example` (secrets policy) and `docs/PRODUCTION.md`.
- **Tests: 26 → 39 assertions**, now covering negative/huge values, one-off costs,
  break-even, CAGR null cases and health-score bounds.

## Still open (why it's 78, not 90+)
- Auth wired but **not verified against the live backend** from this environment.
- **Cloud data sync not in the UI** — business data still lives in the browser.
- Multi-business switching, team roles/invitations UI, and audit-log UI not built yet
  (the database schema + RLS support them).
- Payments, Google/Apple and custom domain need owner accounts/keys.
- No rate limiting on the AI function yet.
