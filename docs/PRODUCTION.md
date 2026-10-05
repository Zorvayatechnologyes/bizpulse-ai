# Production configuration — BizPulse AI

## Secrets policy
- **Never** put `SUPABASE_SERVICE_ROLE_KEY`, `AI_API_KEY`, `RAZORPAY_KEY_SECRET` or
  `STRIPE_SECRET_KEY` in frontend code. They live only as edge-function secrets.
- The **publishable** Supabase key is public and safe in the client.
- This app stores **no passwords and no password hashes** anywhere. Real sign-in uses
  Supabase Auth (which manages its own session token); demo mode is a credential-free
  guest with nothing persisted.

## Environment
Copy `.env.example` to `.env` and fill the secret values. Apply the same values as
edge-function secrets in the Supabase dashboard (or `supabase secrets set`).

## Deploy
1. **Database:** apply `supabase/migrations/0001_bizpulse_init.sql`.
2. **Functions:** deploy `ai-proxy` and `checkout` (verify_jwt = true).
3. **Secrets:** set `AI_API_KEY` (+ optional AI_*), and payment keys.
4. **Auth:** email/password works by default; add Google/Apple credentials in the
   dashboard and allowlist the deployed URL under Redirect URLs.
5. **Hosting:** GitHub Pages builds from `main` (https://zorvayatechnologyes.github.io/bizpulse-ai/);
   Netlify builds from the same repo. For a custom domain, point your registrar's DNS
   at the host and enable HTTPS.

## Data & sync
Business data currently lives in the browser. The database schema + RLS are ready for
cloud sync (multi-tenant, per-organization). Wiring the data layer to Supabase is the
next step; the `BPAuth.api()` helper is the intended entry point.

## Tests
`node tests/engine.test.mjs` — financial formulas and edge cases.
