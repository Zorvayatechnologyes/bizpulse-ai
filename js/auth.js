/* ============================================================
   AUTH LAYER — DEMO / LOCAL AUTH  (no backend connected)
   ------------------------------------------------------------
   This sign-in is device-local and is NOT secure authentication:
   the account lives in this browser's localStorage and anyone with
   the page source can bypass the gate. It exists so the product is
   usable today, and so the UI can be pointed at a real backend
   later without touching the interface.

   The UI only ever calls window.BPAuth.*. To go live, replace the
   adapter below with Supabase / Firebase / your own API. Keep the
   same method names and the same return shape { ok, user?, error? }.
   ============================================================ */
(function () {
  'use strict';
  var ACCT = 'bizpulse.account.v1', SESS = 'bizpulse.session.v1';
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

  /* ---------------- BACKEND ADAPTER ----------------
     DEMO / LOCAL implementation. Replace these five bodies with real
     calls; keep the signatures and the { ok, user?, error? } shape. */
  var adapter = {
    mode: 'local',
    secure: false,
    async signup(email, password) {
      if (read(ACCT)) return { ok: false, error: 'An account already exists on this device.' };
      var salt = rand(16);
      var acct = { email: email, salt: salt, hash: await hash(password, salt), created: new Date().toISOString() };
      write(ACCT, acct);
      var s = { email: email, since: new Date().toISOString() };
      write(SESS, s);
      return { ok: true, user: { email: email }, session: s };
    },
    async login(email, password) {
      var acct = read(ACCT);
      if (!acct) return { ok: false, error: 'No account on this device yet.' };
      if (email !== acct.email) return { ok: false, error: 'That is not the email set up on this device.' };
      if ((await hash(password, acct.salt)) !== acct.hash) return { ok: false, error: 'Incorrect password.' };
      var s = { email: email, since: new Date().toISOString() };
      write(SESS, s);
      return { ok: true, user: { email: email }, session: s };
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
      if (acct && s && s.email === acct.email) return { ok: true, user: { email: acct.email }, session: s };
      return { ok: true, user: null, session: null };
    }
  };

  /* ---------------- PUBLIC API (the UI calls only this) ---------------- */
  var listeners = [];
  function emit(u) { listeners.forEach(function (cb) { try { cb(u); } catch (e) {} }); }
  window.BPAuth = {
    mode: adapter.mode,
    isSecure: adapter.secure,
    isBackendConnected: adapter.mode === 'backend',
    hasAccount: function () { return !!read(ACCT); },
    login: function (email, password) { return adapter.login(email, password); },
    signup: function (email, password) { return adapter.signup(email, password); },
    logout: function () { return adapter.logout().then(function (r) { emit(null); return r; }); },
    resetPassword: function (email) { return adapter.resetPassword(email); },
    getSession: function () { return adapter.getSession(); },
    onChange: function (cb) { listeners.push(cb); }
  };

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
    $('authSub').textContent = create ? 'Choose an email and a password for this device.' : 'Welcome back — sign in to open your workspace.';
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
    if (!window.BPAuth.hasAccount()) {
      if (pw !== ($('authConfirm').value || '')) { setStatus('The passwords do not match.', 'err'); return; }
      setStatus('Creating your account…');
      var r = await window.BPAuth.signup(email, pw);
      if (!r.ok) { setStatus(r.error, 'err'); return; }
      setStatus('Account created.', 'ok'); showApp(r.user); return;
    }
    setStatus('Signing in…');
    var r2 = await window.BPAuth.login(email, pw);
    if (!r2.ok) { setStatus(r2.error, 'err'); return; }
    setStatus('Signed in.', 'ok'); showApp(r2.user);
  }
  async function reset() {
    if (!confirm('Reset sign-in on this device? This deletes the local account and signs you out. Your business data is not touched.')) return;
    var r = await window.BPAuth.resetPassword($('authEmail').value || '');
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
    var s = await window.BPAuth.getSession();
    if (s.user) showApp(s.user); else { showGate(); setMode(window.BPAuth.hasAccount() ? 'signin' : 'create'); }
    var sub = $('authSubmit'); if (sub) sub.addEventListener('click', submit);
    var rp = $('authPassword'); if (rp) rp.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    var rc = $('authConfirm'); if (rc) rc.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    var rs = $('authReset'); if (rs) rs.addEventListener('click', reset);
    var av = $('topAvatar'); if (av) av.addEventListener('click', signOut);
    window.BPAuth.onChange(function (u) { if (u) showApp(u); else { showGate(); setMode(window.BPAuth.hasAccount() ? 'signin' : 'create'); } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
