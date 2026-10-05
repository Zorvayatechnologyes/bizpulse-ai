// ============================================================
// Supabase Edge Function: ai-proxy
// ------------------------------------------------------------
// Keeps the AI provider key on the SERVER. The browser calls this
// function with the user's JWT; it never receives the key.
// Enforces a monthly usage limit per organization and records usage.
//
// Required function secrets (set in the Supabase dashboard, never in code):
//   AI_API_KEY   — the provider key (or OPENAI_API_KEY)
//   AI_BASE_URL  — optional, default https://api.openai.com/v1
//   AI_MODEL     — optional, default gpt-4o-mini
//   AI_MONTHLY_LIMIT — optional, default 200
// ============================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const AI_KEY = Deno.env.get("AI_API_KEY") ?? Deno.env.get("OPENAI_API_KEY");
    const AI_BASE = Deno.env.get("AI_BASE_URL") ?? "https://api.openai.com/v1";
    const AI_MODEL = Deno.env.get("AI_MODEL") ?? "gpt-4o-mini";
    const MONTHLY_LIMIT = Number(Deno.env.get("AI_MONTHLY_LIMIT") ?? "200");

    if (!AI_KEY) {
      return json({ ok: false, error: "AI provider not configured. Set the AI_API_KEY secret for this function." }, 501);
    }

    const auth = req.headers.get("Authorization") ?? "";
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { global: { headers: { Authorization: auth } } });
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (!user) return json({ ok: false, error: "Not authenticated." }, 401);

    const { data: mem } = await supabase
      .from("bp_memberships").select("org_id, role").eq("user_id", user.id).limit(1).maybeSingle();
    const orgId = mem?.org_id ?? null;

    if (orgId) {
      const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      const { count } = await supabase
        .from("bp_usage_events")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId).eq("kind", "agent_run").gte("created_at", since);
      if ((count ?? 0) >= MONTHLY_LIMIT) {
        return json({ ok: false, error: "Monthly AI limit reached for your plan." }, 429);
      }
    }

    const body = await req.json().catch(() => ({}));
    if (!Array.isArray(body.messages)) return json({ ok: false, error: "messages[] is required." }, 400);

    const payload = {
      model: AI_MODEL,
      messages: body.messages,
      max_tokens: body.max_tokens ?? 600,
      temperature: body.temperature ?? 0.4,
    };
    const text = await withRetry(() => callProvider(AI_BASE, AI_KEY, payload));

    if (orgId) await supabase.from("bp_usage_events").insert({ org_id: orgId, user_id: user.id, kind: "agent_run" });

    return json({ ok: true, text, model: AI_MODEL, provider: "openai-compatible" });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});

async function callProvider(base: string, key: string, payload: unknown): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(base.replace(/\/$/, "") + "/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": "Bearer " + key },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error("provider " + res.status + ": " + (await res.text()).slice(0, 180));
    const data = await res.json();
    return ((data?.choices?.[0]?.message?.content) ?? "").trim();
  } finally {
    clearTimeout(timer);
  }
}

async function withRetry<T>(fn: () => Promise<T>, tries = 2): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) {
      last = e;
      if (i < tries - 1) await new Promise((r) => setTimeout(r, 600));
    }
  }
  throw last;
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, "content-type": "application/json" } });
}
