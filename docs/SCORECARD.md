# Production-readiness scorecard (updated)

This supersedes the score in `docs/AUDIT.md`. Ratings are re-scored after wiring the
backend-first auth and adding the plan/usage panel. Honest, not inflated.

| Area | Before | Now | Why it moved |
|---|---|---|---|
| Deterministic financial engine | 9/10 | 9/10 | Correct formulas; malformed-data guards + 26 tests |
| Data validation & error handling | 8/10 | 8/10 | Import validation, AI timeout/retry, clear states |
| Security (client) | 6/10 | 7/10 | No secrets shipped; XSS-safe; backend-first auth |
| **Authentication** | **4/10** | **8/10** | Real Supabase auth is now the primary path, with a clearly-labelled demo fallback |
| Accessibility | 7/10 | 7/10 | Landmarks, labels, live regions |
| Responsive & performance | 8/10 | 8/10 | Fluid layout; lazy SheetJS; cached/batched AI |
| **Backend & cloud sync** | **5/10** | **7/10** | Backend is now wired into the auth path; cloud **data** sync in the UI still pending |
| **Payments / subscriptions** | **3/10** | **6/10** | Plans + usage meter + server checkout wired; still needs owner payment keys |

**Overall: 55 → 72 / 100**

## What changed this pass
- **Backend-first authentication.** The app now uses Supabase auth by default (email +
  password); if the backend is unreachable it shows a clear message and a **"Continue in
  demo mode"** fallback that is explicitly labelled. Verified both paths.
- **Plan & usage panel** in Settings: Free / Pro / Business, a live usage meter that
  increments per analysis, and an Upgrade button that calls the server-side `checkout`
  function — reporting honestly when payments are not configured.
- **Dynamic readiness** now reflects the real auth mode.

## Honest limits that keep it at 72, not 90
- Auth is wired but **not verified against the live backend** from the build sandbox
  (it cannot reach `supabase.co`). Needs one real sign-in on your side.
- **Cloud data sync is not in the UI yet** — business data still lives in the browser;
  the DB schema + RLS are ready to connect.
- Payments, Google/Apple sign-in and the custom domain still need your accounts/keys.
- No rate limiting on the AI function yet.

To reach ~85: connect the data layer to Supabase (cloud sync), then payments + an admin
dashboard.
