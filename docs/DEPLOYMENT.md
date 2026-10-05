# Deployment & backend setup — BizPulse AI

This is the go-live checklist. Some steps can only be done by someone logged into
your Supabase / registrar / payment accounts — they are marked **[you]**.

## 1. Database
Apply the migration in `supabase/migrations/0001_bizpulse_init.sql` to your Supabase
project. It creates the multi-tenant tables (organizations, memberships, businesses,
months, analyses, reports, meetings, subscriptions, usage) with Row Level Security,
plus a trigger that creates a profile + organization + free subscription for every
new user (automated onboarding).

## 2. Server-side AI (keeps the key off the client)
Deploy `supabase/functions/ai-proxy`. Then set its secrets **[you]** (Dashboard →
Edge Functions → ai-proxy → Secrets, or `supabase secrets set`):
- `AI_API_KEY` — your provider key
- `AI_BASE_URL` — optional (default OpenAI)
- `AI_MODEL` — optional
- `AI_MONTHLY_LIMIT` — optional

The browser calls this function with the user's JWT; it never sees the key. The
function also enforces the monthly limit and records usage.

## 3. Payments
Deploy `supabase/functions/checkout`. Set secrets **[you]**:
- Razorpay: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`
- or Stripe: `STRIPE_SECRET_KEY`

Until these are set, checkout returns **501 "not configured"** and the UI says so —
it never pretends a payment happened. Add a webhook endpoint to mark subscriptions
`active` on successful payment.

## 4. Authentication
Supabase email/password auth works out of the box. For **Google / Apple** sign-in
**[you]**: Authentication → Providers, add credentials, and add your deployed URL to
Authentication → URL Configuration → Redirect URLs.

## 5. Hosting & custom domain
- The site deploys from this GitHub repo via Netlify (push to `main`).
- **Custom domain [you]**: Netlify → Domain management → add domain, then point your
  registrar's DNS (A / CNAME) to Netlify. Enable HTTPS.

## 6. Security rules
Row Level Security is on for every table and scoped to organization membership
(`bp_is_member` / `bp_is_admin`). Never expose the service-role key in the frontend.
The publishable/anon key is safe to ship; the service-role key is not.

## Honest readiness

| Area | Status |
|---|---|
| UI, responsive, charts, financial calculations | Ready |
| Cloud database + RLS | Ready (once migration applied) |
| Server-side AI proxy + usage limits | Ready (once secrets set) |
| Automated onboarding (org + profile + plan) | Ready |
| Payments (Razorpay/Stripe) | Needs Configuration (your keys) |
| Google / Apple sign-in | Needs Configuration (dashboard) |
| Multi-user / roles / admin | Ready (schema + RLS in place) |
| Custom domain | Needs Configuration (your registrar) |
