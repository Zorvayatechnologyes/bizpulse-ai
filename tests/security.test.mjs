// ============================================================
// Automated security tests.
// Run: node tests/security.test.mjs
// Checks: no secrets in frontend, strict CSP, security headers,
// no browser-side password hashing, defensive input handling.
// ============================================================
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const jsFiles = fs.readdirSync(path.join(root, "js")).map((f) => "js/" + f);
const frontend = ["index.html", ...jsFiles].map(read).join("\n");

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.log("  FAIL:", name); } }

// ---- 1. no secrets in frontend ----
ok("no service_role key in frontend", !/service_role/i.test(frontend));
ok("no SUPABASE_SERVICE_ROLE_KEY value", !/SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*['"][^'"]+/.test(frontend));
ok("no OpenAI-style secret key", !/sk-[A-Za-z0-9]{20,}/.test(frontend));
ok("no Anthropic key name", !/ANTHROPIC_API_KEY/.test(frontend));
ok("no AI_API_KEY assignment", !/AI_API_KEY\s*[:=]\s*['"][^'"]+/.test(frontend));
ok("no razorpay secret in frontend", !/RAZORPAY_KEY_SECRET\s*[:=]\s*['"][^'"]+/.test(frontend));

// ---- 2. strict CSP ----
const csp = (read("index.html").match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1] || "";
ok("CSP present", csp.length > 0);
ok("CSP script-src restricted (hash or external only)", /script-src/.test(csp) && !/script-src[^;]*unsafe-inline/.test(csp));
ok("CSP script-src has NO unsafe-inline", !/script-src[^;]*unsafe-inline/.test(csp));
ok("CSP object-src none", /object-src 'none'/.test(csp));
ok("CSP base-uri self", /base-uri 'self'/.test(csp));
ok("CSP restrict connect-src", /connect-src 'self' https:\/\//.test(csp));

// ---- 3. security headers file ----
const headers = read("_headers");
["Content-Security-Policy", "Strict-Transport-Security", "X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy"]
  .forEach((h) => ok("_headers has " + h, headers.includes(h)));

// ---- 4. no browser-side password hashing ----
const auth = read("js/auth.js");
ok("auth.js has no password hashing", !/crypto\.subtle\.digest/.test(auth) && !/function hash\(/.test(auth));
ok("auth.js stores no credentials", !/localStorage\.setItem\([^)]*password/i.test(auth) && !/crypto\.subtle\.digest/.test(auth));

// ---- 5. defensive engine (malformed input does not throw) ----
globalThis.window = globalThis;
globalThis.document = { createElement: () => ({ setAttribute() {}, appendChild() {}, style: {} }), getElementById: () => null };
eval(read("js/data.js"));
eval(read("js/engine.js"));
let threw = false;
try { window.BPEngine.compute({ months: [{ label: "x" }, null, { label: "y", revenue: "bad", expenses: 5 }] }); } catch (e) { threw = true; }
ok("engine survives malformed state", !threw);

// ---- 6. output escaping helper present ----
ok("escaping helper used for user content", /replace\(\/\[&<>/.test(frontend));

console.log(`\nsecurity tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
