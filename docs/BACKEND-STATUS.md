# Backend status — BizPulse AI

## Live now (dedicated Supabase project)

- **Project ref:** `xxszydatmykvdnslwgoe`  (region `ap-south-1`)
- **API URL:** `https://xxszydatmykvdnslwgoe.supabase.co`
- **Publishable key (safe to ship in the frontend):**
  `sb_publishable_nPAykkPJJA-zbVBjgcYY2A_nZ7P4FOt`

> The service-role key is a secret. Never put it in frontend code.

### Database (applied)
10 tables, every one with Row Level Security enabled:
`bp_profiles, bp_organizations, bp_memberships, bp_businesses, bp_business_months,
bp_analyses, bp_reports, bp_meetings, bp_subscriptions, bp_usage_events`
plus a trigger that creates a profile + organization + free subscription for each
new user (automated onboarding).

### Edge functions (deployed, verify_jwt = true)
- `ai-proxy` — server-side AI; the key stays on the server; enforces the monthly
  usage limit and records usage. **Needs secret `AI_API_KEY` to actually answer.**
- `checkout` — Razorpay/Stripe orders. **Needs `RAZORPAY_KEY_ID` +
  `RAZORPAY_KEY_SECRET` or `STRIPE_SECRET_KEY`.** Returns 501 until configured.

## Still to do
- Wire the frontend auth adapter to this project (email/password works by default;
  Google/Apple need dashboard credentials).
- Admin dashboard UI + role checks.
- Set the function secrets above (owner action).
- Custom domain (owner action).

## Not verifiable from the build sandbox
The build sandbox cannot reach `supabase.co`, so live backend calls are exercised in
the browser, not during automated tests here.
