/* ============================================================
   AUTH — Supabase backend when reachable, DEMO / LOCAL otherwise
   ------------------------------------------------------------
   The UI only ever calls window.BPAuth.*. Two adapters implement the
   same API: a Supabase adapter (real accounts, cloud) and a
   device-local demo adapter. If the backend is unreachable the user
   can continue in demo mode, clearly labelled.
   No secrets live here — only the public publishable key.
   ============================================================ */
(function () {
  'use strict';
  var CONFIG = {
    supabaseUrl: 'https://xxszydatmykvdnslwgoe.supabase.co',
    supabaseKey: 'sb_publishable_nPAykkPJJA-zbVBjgcYY2A_nZ7P4FOt'
  };
  var ACCT = 'bizpulse.account.v1', SESS = 'bizpulse.session.v1';
  var sb = null;
  function $(id) { return document.getElementById(id); }
  function read(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function rand(n) {
    var a = new Uint8Array(n);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a);
    else for (var i = 0; i < n; i++) a[i] = Math.floor(Math.random() * 256);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  async function hash(pw, salt) {
    if (window.crypto && crypto.subtle && window.TextEncoder) {
      var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + '::' + pw));
      return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    }
    var h = 2166136261 >>> 0, s = salt + '::' + pw;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return 'fnv' + (h >>> 0).toString(16);
  }
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

  /* ---------------- DEMO / LOCAL adapter ---------------- */
  var localAdapter = {
    mode: 'local', secure: false,
    async signup(email, password) {
      if (read(ACCT)) return { ok: false, error: 'An account already exists on this device.' };
      var salt = rand(16);
      var acct = { email: email, salt: salt, hash: await hash(password, salt), created: new Date().toISOString() };
      write(ACCT, acct); write(SESS, { email: email, since: new Date().toISOString() });
      return { ok: true, user: { email: email } };
    },
    async login(email, password) {
      var acct = read(ACCT);
      if (!acct) return { ok: false, error: 'No account on this device yet.' };
      if (email !== acct.email) return { ok: false, error: 'That is not the email set up on this device.' };
      if ((await hash(password, acct.salt)) !== acct.hash) return { ok: false, error: 'Incorrect password.' };
      write(SESS, { email: email, since: new Date().toISOString() });
      return { ok: true, user: { email: email } };
    },
    async logout() { del(SESS); return { ok: true }; },
    async resetPassword(email) {
      var acct = read(ACCT);
      if (!acct || (email && email !== acct.email)) return { ok: false, error: 'No matching account on this device.' };
      del(ACCT); del(SESS);
      return { ok: true, message: 'Local account cleared.' };
    },
    async getSession() {
      var acct = read(ACCT), s = read(SESS);
      if (acct && s && s.email === acct.email) return { ok: true, user: { email: acct.email } };
      return { ok: true, user: null };
    },
    hasAccount: function () { return !!read(ACCT); }
  };

  /* ---------------- Supabase adapter ---------------- */
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

  var active = localAdapter;
  var listeners = [];
  function emit(u) { listeners.forEach(function (cb) { try { cb(u); } catch (e) {} }); }

  window.BPAuth = {
    mode: 'local', isSecure: false, isBackendConnected: false,
    hasAccount: function () { return active.hasAccount ? active.hasAccount() : false; },
    async login(email, password) {
      try { return await active.login(email, password); }
      catch (e) { return { ok: false, error: friendly(e), offline: true }; }
    },
    async signup(email, password) {
      try { return await active.signup(email, password); }
      catch (e) { return { ok: false, error: friendly(e), offline: true }; }
    },
    async logout() { try { var r = await active.logout(); } catch (e) {} emit(null); return { ok: true }; },
    async resetPassword(email) {
      try { return await active.resetPassword(email); }
      catch (e) { return { ok: false, error: friendly(e), offline: true }; }
    },
    async getSession() {
      try { return await active.getSession(); }
      catch (e) { return { ok: true, user: null }; }
    },
    onChange: function (cb) { listeners.push(cb); },
    useDemo: function () { setActive(localAdapter); },
    /* ---- API layer stub for future cloud data sync ---- */
    async api(fn, args) {
      if (active.mode !== 'backend' || !sb) return { ok: false, error: 'backend-unavailable' };
      return { ok: true, data: await fn(sb, args) };
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
    var b = $('authBadge'); if (b) b.textContent = window.BPAuth.isSecure ? 'Secure sign-in' : 'Demo / local sign-in';
    var note = $('authNote');
    if (note) note.innerHTML = window.BPAuth.isSecure
      ? 'Signing in with the secure backend. If it is unreachable you can continue in demo mode.'
      : 'Demo / local sign-in — your account is stored only in this browser and is <strong>not</strong> secured by a server.';
  }

  /* ---------------- UI ---------------- */
  function setStatus(msg, kind) {
    var s = $('authStatus'); if (!s) return;
    s.classList.remove('hidden', 'err', 'ok'); if (kind) s.classList.add(kind);
    s.textContent = msg;
  }
  function initials(email) { return email ? (email[0] + (email[1] || '')).toUpperCase() : 'BP'; }
  function showApp(user) {
    var g = $('authGate'); if (g) g.classList.add('hidden');
    document.body.classList.remove('locked');
    var av = $('topAvatar');
    if (av) { av.textContent = initials(user && user.email); av.title = ((user && user.email) || 'Signed in') + ' — click to sign out'; av.style.cursor = 'pointer'; }
  }
  function showGate() {
    var g = $('authGate'); if (g) g.classList.remove('hidden');
    document.body.classList.add('locked');
  }
  function setMode(mode) {
    var create = mode === 'create';
    $('authTitle').textContent = create ? 'Create your account' : 'Sign in';
    $('authSub').textContent = create ? 'Choose an email and a password.' : 'Welcome back — sign in to open your workspace.';
    $('authSubmit').textContent = create ? 'Create account' : 'Sign in';
    $('authConfirmRow').classList.toggle('hidden', !create);
    $('authPassword').setAttribute('autocomplete', create ? 'new-password' : 'current-password');
    $('authReset').style.display = create ? 'none' : 'inline';
    var st = $('authStatus'); if (st) st.classList.add('hidden');
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
    var d2 = $('authDemo'); if (d2) d2.classList.add('hidden');
    setStatus(creating ? 'Account created.' : 'Signed in.', 'ok'); showApp(r.user);
  }
  async function reset() {
    if (!confirm('Reset sign-in? This signs you out' + (window.BPAuth.isSecure ? ' and sends a reset email.' : ' and deletes the local account (your data is not touched).'))) return;
    var r = await window.BPAuth.resetPassword($('authEmail').value || '');
    if (window.BPAuth.isSecure) { setStatus(r.ok ? 'Reset email sent.' : r.error, r.ok ? 'ok' : 'err'); return; }
    $('authPassword').value = ''; $('authConfirm').value = '';
    setMode('create');
    setStatus(r.ok ? 'Local sign-in reset — create a new one.' : r.error, r.ok ? 'ok' : 'err');
  }
  async function signOut() {
    if (!confirm('Sign out of BizPulse AI?')) return;
    await window.BPAuth.logout();
    setStatus('Signed out.');
  }
  async function init() {
    /* prefer the real backend when configured and reachable to load */
    if (CONFIG.supabaseUrl && CONFIG.supabaseKey) {
      try {
        await loadSupabase();
        sb = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);
        setActive(supabaseAdapter);
        try { sb.auth.onAuthStateChange(function (_e, s) { if (s) showApp(s.user); else { showGate(); setMode('signin'); } }); } catch (e) {}
      } catch (e) { setActive(localAdapter); }
    }
    var s = await window.BPAuth.getSession();
    if (s.user) showApp(s.user); else { showGate(); setMode(window.BPAuth.hasAccount() ? 'signin' : 'create'); }
    var sub = $('authSubmit'); if (sub) sub.addEventListener('click', submit);
    var rp = $('authPassword'); if (rp) rp.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    var rc = $('authConfirm'); if (rc) rc.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    var rs = $('authReset'); if (rs) rs.addEventListener('click', reset);
    var dm = $('authDemo'); if (dm) dm.addEventListener('click', function () { window.BPAuth.useDemo(); dm.classList.add('hidden'); setStatus('Demo mode: create a local account below.', 'ok'); setMode('create'); });
    var av = $('topAvatar'); if (av) av.addEventListener('click', signOut);
    updateBadge();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
