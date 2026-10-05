// ============================================================
// Supabase Edge Function: checkout
// ------------------------------------------------------------
// Creates a payment order with Razorpay (or Stripe) using keys that
// live only on the server. If no keys are configured it returns 501
// so the UI can honestly say "payments need configuration" instead
// of pretending a payment happened.
//
// Required function secrets (set in the Supabase dashboard):
//   Razorpay: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
//   Stripe:   STRIPE_SECRET_KEY
//   Optional: RAZORPAY_WEBHOOK_SECRET (for verifying webhooks)
// ============================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Prices in the smallest currency unit (paise for INR).
const PLANS: Record<string, { amount: number; currency: string }> = {
  pro: { amount: 99900, currency: "INR" },
  business: { amount: 299900, currency: "INR" },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    const plan = String(body.plan ?? "pro");
    const price = PLANS[plan] ?? PLANS.pro;

    const razorId = Deno.env.get("RAZORPAY_KEY_ID");
    const razorSecret = Deno.env.get("RAZORPAY_KEY_SECRET");
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");

    if (razorId && razorSecret) {
      const res = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": "Basic " + btoa(razorId + ":" + razorSecret),
        },
        body: JSON.stringify({
          amount: price.amount,
          currency: price.currency,
          receipt: "rcpt_" + Date.now(),
          notes: { plan },
        }),
      });
      const data = await res.json();
      if (!res.ok) return json({ ok: false, error: "Razorpay error: " + (data?.error?.description ?? res.status) }, 502);
      return json({ ok: true, provider: "razorpay", order: data, keyId: razorId });
    }

    if (stripeKey) {
      const form = new URLSearchParams();
      form.set("mode", "payment");
      form.set("line_items[0][price_data][currency]", price.currency.toLowerCase());
      form.set("line_items[0][price_data][product_data][name]", "BizPulse AI — " + plan);
      form.set("line_items[0][price_data][unit_amount]", String(price.amount));
      form.set("line_items[0][quantity]", "1");
      form.set("success_url", String(body.success_url ?? "https://example.com/success"));
      form.set("cancel_url", String(body.cancel_url ?? "https://example.com/cancel"));
      const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: { "authorization": "Bearer " + stripeKey, "content-type": "application/x-www-form-urlencoded" },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) return json({ ok: false, error: "Stripe error: " + (data?.error?.message ?? res.status) }, 502);
      return json({ ok: true, provider: "stripe", url: data.url });
    }

    return json({
      ok: false,
      error: "Payments are not configured yet. Add RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET or STRIPE_SECRET_KEY as function secrets.",
    }, 501);
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, "content-type": "application/json" } });
}
