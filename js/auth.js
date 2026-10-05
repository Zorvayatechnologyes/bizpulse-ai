/* ============================================================
   AUTH — Supabase backend, or a credential-free DEMO guest
   ------------------------------------------------------------
   Two adapters implement the same API:
     • supabaseAdapter — real accounts + sessions (Supabase Auth).
     • guestAdapter    — DEMO only: starts a guest session with NO
                         email, NO password and NO stored credential.
   No passwords or password hashes are ever stored anywhere by this
   app. Only the public publishable key is present here; the AI and
   payment keys live server-side in edge functions.
   ============================================================ */
(function () {
  'use strict';
  var CONFIG = {
    supabaseUrl: 'https://xxszydatmykvdnslwgoe.supabase.co',
    supabaseKey: 'sb_publishable_nPAykkPJJA-zbVBjgcYY2A_nZ7P4FOt'
  };
  var sb = null, guestUser = null; /* guest session is in-memory only — nothing persisted */
  function $(id) { return document.getElementById(id); }
  function isEmail(e) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e); }
  function friendly(e) {
    var m = String((e && e.message) || e || 'Something went wrong.');
    if (/fetch|network|load failed|failed to fetch|timeout|abort/i.test(m)) return 'Could not reach the backend. Check your connection, or continue in demo mode.';
    return m;
  }
  function loadSupabase() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve();
    if (window.__sbP) return window.__sbP;
    window.__sbP = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      s.onload = function () { resolve(); };
      s.onerror = function () { window.__sbP = null; reject(new Error('Could not load the sign-in library')); };
      document.head.appendChild(s);
    });
    return window.__sbP;
  }

  /* ---- Supabase adapter (real, secure) ---- */
  var supabaseAdapter = {
    mode: 'backend', secure: true,
    async signup(email, password) {
      var r = await sb.auth.signUp({ email: email, password: password });
      if (r.error) throw r.error;
      if (!r.data.session) return { ok: false, error: 'Account created — check your email to confirm, then sign in.' };
      return { ok: true, user: r.data.user };
    },
    async login(email, password) {
      var r = await sb.auth.signInWithPassword({ email: email, password: password });
      if (r.error) throw r.error;
      return { ok: true, user: r.data.user };
    },
    async logout() { await sb.auth.signOut(); return { ok: true }; },
    async resetPassword(email) {
      var r = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      if (r.error) throw r.error;
      return { ok: true, message: 'Reset email sent.' };
    },
    async getSession() {
      var r = await sb.auth.getSession();
      var s = r.data && r.data.session;
      return { ok: true, user: s ? s.user : null };
    },
    hasAccount: function () { return false; }
  };

  /* ---- Guest demo adapter (no credentials at all) ---- */
  var guestAdapter = {
    mode: 'guest', secure: false,
    async guest() { guestUser = { email: 'demo@guest', guest: true }; return { ok: true, user: guestUser }; },
    async signup() { return { ok: false, error: 'Demo mode is guest-only.' }; },
    async login() { return { ok: false, error: 'Demo mode is guest-only.' }; },
    async logout() { guestUser = null; return { ok: true }; },
    async resetPassword() { return { ok: true, message: 'Demo mode stores nothing to reset.' }; },
    async getSession() { return { ok: true, user: guestUser }; },
    hasAccount: function () { return false; }
  };

  var active = supabaseAdapter;
  var listeners = [];
  function emit(u) { listeners.forEach(function (cb) { try { cb(u); } catch (e) {} }); }

  window.BPAuth = {
    mode: 'backend', isSecure: true, isBackendConnected: true,
    hasAccount: function () { return active.hasAccount ? active.hasAccount() : false; },
    async login(e, p) { try { return await active.login(e, p); } catch (err) { return { ok: false, error: friendly(err), offline: true }; } },
    async signup(e, p) { try { return await active.signup(e, p); } catch (err) { return { ok: false, error: friendly(err), offline: true }; } },
    async logout() { try { await active.logout(); } catch (e) {} emit(null); return { ok: true }; },
    async resetPassword(e) { try { return await active.resetPassword(e); } catch (err) { return { ok: false, error: friendly(err), offline: true }; } },
    async getSession() { try { return await active.getSession(); } catch (e) { return { ok: true, user: null }; } },
    onChange: function (cb) { listeners.push(cb); },
    async useDemo() { setActive(guestAdapter); return guestAdapter.guest(); },
    /* server API layer for cloud data (used when signed in to the backend) */
    async api(fn, args) {
      if (active.mode !== 'backend' || !sb) return { ok: false, error: 'backend-unavailable' };
      try { return { ok: true, data: await fn(sb, args) }; }
      catch (e) { return { ok: false, error: friendly(e) }; }
    }
  };

  function setActive(adapter) {
    active = adapter;
    window.BPAuth.mode = adapter.mode;
    window.BPAuth.isSecure = adapter.secure;
    window.BPAuth.isBackendConnected = adapter.mode === 'backend';
    updateBadge();
  }
  function updateBadge() {
    var b = $('authBadge'); if (b) b.textContent = window.BPAuth.isSecure ? 'Secure sign-in' : 'Demo guest mode';
    var note = $('authNote');
    if (note) note.innerHTML = window.BPAuth.isSecure
      ? 'Signing in with the secure backend. If it is unreachable you can continue in demo mode.'
      : 'Demo guest mode — no account and <strong>no password</strong> is created or stored. Nothing is saved to a server.';
  }

  function setStatus(msg, kind) {
    var s = $('authStatus'); if (!s) return;
    s.classList.remove('hidden', 'err', 'ok'); if (kind) s.classList.add(kind);
    s.textContent = msg;
  }
  function initials(email) { return email ? (email[0] + (email[1] || '')).toUpperCase() : 'G'; }
  function showApp(user) {
    var g = $('authGate'); if (g) g.classList.add('hidden');
    document.body.classList.remove('locked');
    var av = $('topAvatar');
    if (av) { av.textContent = user && user.guest ? 'DEMO' : initials(user && user.email); av.title = (user && user.guest ? 'Demo guest' : ((user && user.email) || 'Signed in')) + ' — click to sign out'; av.style.cursor = 'pointer'; }
  }
  function showGate() {
    var g = $('authGate'); if (g) g.classList.remove('hidden');
    document.body.classList.add('locked');
  }
  function applyMode() {
    var secure = window.BPAuth.isSecure;
    ['rowEmail', 'rowPassword', 'authConfirmRow'].forEach(function (id) { var e = $(id); if (e) e.classList.toggle('hidden', !secure); });
    var act = document.querySelector('.auth-actions'); if (act) act.classList.toggle('hidden', !secure);
    var rs = $('authReset'); if (rs) rs.style.display = secure ? 'inline' : 'none';
    var gb = $('authGuest'); if (gb) gb.classList.toggle('hidden', secure);
    var st = $('authStatus'); if (st) st.classList.add('hidden');
    if (!secure) {
      $('authTitle').textContent = 'Explore the demo';
      $('authSub').textContent = 'Continue as a guest to try BizPulse with sample data. No account needed.';
    } else {
      var has = window.BPAuth.hasAccount();
      $('authTitle').textContent = has ? 'Sign in' : 'Create your account';
      $('authSub').textContent = has ? 'Welcome back — sign in to open your workspace.' : 'Choose an email and a password.';
      $('authSubmit').textContent = has ? 'Sign in' : 'Create account';
      $('authConfirmRow').classList.toggle('hidden', has);
    }
  }
  async function submit() {
    var email = ($('authEmail').value || '').trim().toLowerCase();
    var pw = $('authPassword').value || '';
    if (!isEmail(email)) { setStatus('Enter a valid email address.', 'err'); return; }
    if (pw.length < 6) { setStatus('Password must be at least 6 characters.', 'err'); return; }
    var creating = !window.BPAuth.hasAccount();
    if (creating && pw !== ($('authConfirm').value || '')) { setStatus('The passwords do not match.', 'err'); return; }
    setStatus(creating ? 'Creating your account…' : 'Signing in…');
    var r = creating ? await window.BPAuth.signup(email, pw) : await window.BPAuth.login(email, pw);
    if (!r.ok) { setStatus(r.error, 'err'); if (r.offline) { var d = $('authDemo'); if (d) d.classList.remove('hidden'); } return; }
    setStatus(creating ? 'Account created.' : 'Signed in.', 'ok'); showApp(r.user);
  }
  async function guest() {
    var r = await window.BPAuth.useDemo();
    setStatus('Demo guest session started.', 'ok'); showApp(r.user);
  }
  async function reset() {
    if (!confirm('Send a password reset email?')) return;
    var r = await window.BPAuth.resetPassword($('authEmail').value || '');
    setStatus(r.ok ? (r.message || 'Reset email sent.') : r.error, r.ok ? 'ok' : 'err');
  }
  async function signOut() {
    if (!confirm('Sign out of BizPulse AI?')) return;
    await window.BPAuth.logout();
    showGate(); applyMode();
    setStatus('Signed out.');
  }
  async function init() {
    if (CONFIG.supabaseUrl && CONFIG.supabaseKey) {
      try {
        await loadSupabase();
        sb = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);
        setActive(supabaseAdapter);
        try { sb.auth.onAuthStateChange(function (_e, s) { if (s) showApp(s.user); else { showGate(); applyMode(); } }); } catch (e) {}
      } catch (e) { setActive(guestAdapter); }
    } else { setActive(guestAdapter); }
    var s = await window.BPAuth.getSession();
    if (s.user) showApp(s.user); else { showGate(); applyMode(); }
    var sub = $('authSubmit'); if (sub) sub.addEventListener('click', submit);
    var gp = $('authPassword'); if (gp) gp.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    var gc = $('authConfirm'); if (gc) gc.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    var rs = $('authReset'); if (rs) rs.addEventListener('click', reset);
    var gb = $('authGuest'); if (gb) gb.addEventListener('click', guest);
    var dm = $('authDemo'); if (dm) dm.addEventListener('click', function () { window.BPAuth.useDemo(); dm.classList.add('hidden'); applyMode(); setStatus('Demo mode ready — continue as a guest below.', 'ok'); });
    var av = $('topAvatar'); if (av) av.addEventListener('click', signOut);
    updateBadge();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
