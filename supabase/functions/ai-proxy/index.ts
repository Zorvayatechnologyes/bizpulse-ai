// ============================================================
// Supabase Edge Function: ai-proxy  (hardened)
// ------------------------------------------------------------
// The AI provider key lives ONLY here (function secret). The browser
// calls this with the user's JWT and never sees the key.
//
// Protections:
//  • JWT required (verify_jwt = true) — no anonymous use.
//  • Per-user rate limit (requests per minute).
//  • Monthly usage limit per organization.
//  • Request size cap and per-message / total character caps.
//  • Input sanitisation (control characters stripped).
//  • Token cap so a caller cannot request huge completions.
//  • Provider timeout + one retry.
//  • Safe errors — never returns stack traces or provider internals.
// ============================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_BODY_BYTES = 100 * 1024;   // 100 KB request cap
const MAX_MESSAGES = 12;             // messages per request
const MAX_CHARS = 20000;             // total characters across messages
const MAX_TOKENS = 2000;             // hard cap on completion tokens
const RATE_PER_MIN = 20;             // requests per user per minute
const MONTHLY_LIMIT_DEFAULT = 200;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const AI_KEY = Deno.env.get("AI_API_KEY") ?? Deno.env.get("OPENAI_API_KEY");
    const AI_BASE = Deno.env.get("AI_BASE_URL") ?? "https://api.openai.com/v1";
    const AI_MODEL = Deno.env.get("AI_MODEL") ?? "gpt-4o-mini";
    const MONTHLY_LIMIT = Number(Deno.env.get("AI_MONTHLY_LIMIT") ?? String(MONTHLY_LIMIT_DEFAULT));

    if (!AI_KEY) return json({ ok: false, error: "AI provider not configured." }, 501);

    const auth = req.headers.get("Authorization") ?? "";
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { global: { headers: { Authorization: auth } } });
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (!user) return json({ ok: false, error: "Not authenticated." }, 401);

    // request size guard
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return json({ ok: false, error: "Request too large." }, 413);
    let body: any;
    try { body = JSON.parse(raw); } catch { return json({ ok: false, error: "Invalid JSON." }, 400); }

    // rate limit (per user, per minute)
    const sinceMin = new Date(Date.now() - 60_000).toISOString();
    const { count: recent } = await supabase
      .from("bp_usage_events").select("id", { count: "exact", head: true })
      .eq("user_id", user.id).eq("kind", "api_request").gte("created_at", sinceMin);
    if ((recent ?? 0) >= RATE_PER_MIN) return json({ ok: false, error: "Rate limit exceeded. Try again shortly." }, 429);

    const { data: mem } = await supabase
      .from("bp_memberships").select("org_id").eq("user_id", user.id).limit(1).maybeSingle();
    const orgId = mem?.org_id ?? null;

    // monthly usage limit
    if (orgId) {
      const sinceMonth = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      const { count } = await supabase
        .from("bp_usage_events").select("id", { count: "exact", head: true })
        .eq("org_id", orgId).eq("kind", "agent_run").gte("created_at", sinceMonth);
      if ((count ?? 0) >= MONTHLY_LIMIT) return json({ ok: false, error: "Monthly AI limit reached for your plan." }, 429);
    }

    // validate + sanitise messages
    if (!Array.isArray(body.messages) || body.messages.length === 0) return json({ ok: false, error: "messages[] is required." }, 400);
    if (body.messages.length > MAX_MESSAGES) return json({ ok: false, error: "Too many messages." }, 400);
    const clean = sanitizeMessages(body.messages);
    if (!clean || clean.total === 0) return json({ ok: false, error: "No usable message content." }, 400);
    if (clean.total > MAX_CHARS) return json({ ok: false, error: "Message content too long." }, 413);

    const wantTokens = Number(body.max_tokens);
    const maxTokens = Number.isFinite(wantTokens) ? Math.min(Math.max(1, wantTokens), MAX_TOKENS) : 600;

    const payload = { model: AI_MODEL, messages: clean.messages, max_tokens: maxTokens, temperature: 0.4 };
    const text = await withRetry(() => callProvider(AI_BASE, AI_KEY, payload));

    // record usage (both the monthly counter and the per-minute rate limiter)
    if (orgId) {
      await supabase.from("bp_usage_events").insert([
        { org_id: orgId, user_id: user.id, kind: "agent_run" },
        { org_id: orgId, user_id: user.id, kind: "api_request" },
      ]);
    }

    return json({ ok: true, text, model: AI_MODEL, provider: "openai-compatible" });
  } catch (e) {
    // safe error: never leak internals
    console.error("ai-proxy error:", (e as Error)?.message);
    return json({ ok: false, error: "The AI service is temporarily unavailable." }, 500);
  }
});

function sanitizeMessages(input: any[]): { messages: any[]; total: number } | null {
  const out: any[] = [];
  let total = 0;
  for (const m of input) {
    if (!m || typeof m !== "object") continue;
    const role = m.role === "system" || m.role === "assistant" || m.role === "user" ? m.role : "user";
    let content = typeof m.content === "string" ? m.content : "";
    // strip control characters (except newline/tab) and cap length
    content = content.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").slice(0, 8000);
    if (!content) continue;
    total += content.length;
    out.push({ role, content });
  }
  return { messages: out, total };
}

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
    if (!res.ok) throw new Error("provider status " + res.status);
    const data = await res.json();
    return ((data?.choices?.[0]?.message?.content) ?? "").trim();
  } finally { clearTimeout(timer); }
}

async function withRetry<T>(fn: () => Promise<T>, tries = 2): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) { last = e; if (i < tries - 1) await new Promise((r) => setTimeout(r, 600)); }
  }
  throw last;
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, "content-type": "application/json" } });
}
