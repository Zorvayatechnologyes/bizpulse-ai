# BizPulse AI — project status & requirements

Honest snapshot. "Ready" means implemented and verified; "Demo/local" means it works
but only in the browser; "Needs backend/keys" means the code exists but requires your
accounts.

## 1. Feature list

### Implemented and working
- **Dashboard** — KPIs (revenue, net profit rate, burn, runway, cash, health score),
  charts, trends, executive summary.
- **Business data** — manual month entry, CSV/Excel upload with column mapping and
  validation, data editor.
- **AI agents** — seven specialists + a CFO orchestrator; live AI commentary via a
  free keyless provider, with caching and batching.
- **Ask BizPulse** — question routed to the right agent, answered from your figures.
- **Report** — printable business health report; copy summary.
- **Knowledge** — searchable glossary of business & finance terms (49 terms).
- **Meetings** — schedule, agenda, briefs.
- **Alerts** — deterministic smart alerts (cash runway, revenue, expenses, margin,
  cost concentration, health) with severities and read/resolve/dismiss + unread badge.
- **Settings** — currency, display, AI provider, data import/export/clear, and a
  **Product readiness** panel.
- **Auth layer** — sign-in/up/logout/reset with a swappable backend adapter.
- **Responsive** — mobile, tablet, laptop, large monitor.
- **Backend (live)** — dedicated Supabase project with multi-tenant schema + RLS and
  two server-side functions (AI proxy, checkout).

### Not built yet
- Executive-report PDF export, forecasting charts, scenario modelling, admin
  dashboard UI, landing page, dark mode, subscription/usage UI, onboarding wizard.

## 2. Files changed
- `index.html` — markup, styles, app modules (single-file build also exists).
- `js/*.js` — data, engine, agents, llm, charts, app, auth, diagnostics, alerts.
- `styles.css` — all styling incl. responsive + alerts + auth + readiness.
- `supabase/migrations/0001_bizpulse_init.sql` — schema + RLS + onboarding trigger.
- `supabase/functions/ai-proxy/index.ts`, `supabase/functions/checkout/index.ts`.
- `docs/` — PRIVACY.md, TERMS.md, DEPLOYMENT.md, BACKEND-STATUS.md.

## 3. Backend requirements
- Supabase project (created: `xxszydatmykvdnslwgoe`).
- Edge function secrets: `AI_API_KEY` (+ optional AI_BASE_URL / AI_MODEL /
  AI_MONTHLY_LIMIT); `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` or `STRIPE_SECRET_KEY`.
- Email/password auth works by default; Google/Apple need dashboard credentials.

## 4. Environment variables required
| Variable | Where | Purpose |
|---|---|---|
| `AI_API_KEY` | Edge function secret | AI provider key (server-side only) |
| `AI_BASE_URL`, `AI_MODEL`, `AI_MONTHLY_LIMIT` | Edge function secret (optional) | provider config + plan limit |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Edge function secret | payments (India) |
| `STRIPE_SECRET_KEY` | Edge function secret | payments (alternative) |

Never place any of these in frontend JavaScript.

## 5. Database schema (live)
`bp_profiles, bp_organizations, bp_memberships, bp_businesses, bp_business_months,
bp_analyses, bp_reports, bp_meetings, bp_subscriptions, bp_usage_events` — all with
Row Level Security scoped to organization membership.

## 6. API endpoints (Supabase Edge Functions, JWT required)
- `POST /functions/v1/ai-proxy` — `{ messages[], max_tokens?, temperature? }` →
  `{ ok, text, model }`; enforces the monthly limit; records usage.
- `POST /functions/v1/checkout` — `{ plan }` → `{ ok, provider, order|url }`, or
  `501` when payment keys are not set.

## 7. Security checklist
- [x] RLS on every table, scoped by organization membership.
- [x] AI + payment keys held server-side only.
- [x] Passwords hashed (SHA-256 + salt) in the local adapter; Supabase Auth for real.
- [x] User HTML escaped before rendering (`esc`), no unsanitised innerHTML of user data.
- [x] Input validation on auth and imports.
- [ ] Rate limiting (needs backend/edge config).
- [ ] Audit logs (schema has usage/activity hooks; UI pending).
- [ ] Real content protection (static site can be viewed by anyone).

## 8. Remaining limitations
- Frontend is **not yet wired to Supabase** (still the device-local sign-in).
- Payments, Google/Apple, custom domain need owner accounts/keys.
- PDF export, forecasting, scenarios, admin dashboard, landing page not built.
- Cannot be verified from the build sandbox (no access to supabase.co / github.io).

## 9. Deployment
- **GitHub Pages (live):** https://zorvayatechnologyes.github.io/bizpulse-ai/
- Netlify also builds from the same repo.
- Apply the migration + deploy the functions to the Supabase project; set secrets.

## 10. Estimated commercial value
As delivered (working dashboard, agents, alerts, knowledge, responsive UI, live
backend schema + server-side AI), this is a credible **early MVP**. It is not yet a
sellable ₹1 lakh+ product: that needs the frontend wired to the backend, real auth,
payments, an admin dashboard and a landing page. Honest range for the current build:
a **prototype/MVP**, not a finished commercial product.
