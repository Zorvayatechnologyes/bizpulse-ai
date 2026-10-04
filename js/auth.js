/* ==== auth (Supabase) ==== */
(function () {
  var SUPABASE_URL = 'https://itpqcwaniuakbafupkwz.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_RcRZZHH7c-V6WuBqOphy5g_Ks-f95eo';
  var sb = null;
  function $(id) { return document.getElementById(id); }
  function setStatus(msg, kind) {
    var s = $('authStatus'); if (!s) return;
    s.classList.remove('hidden', 'err', 'ok'); if (kind) s.classList.add(kind);
    s.textContent = msg;
  }
  function loadSupabase() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve();
    if (window.__sbP) return window.__sbP;
    window.__sbP = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      s.onload = function () { resolve(); };
      s.onerror = function () { window.__sbP = null; reject(new Error('load failed')); };
      document.head.appendChild(s);
    });
    return window.__sbP;
  }
  function initials(session) {
    var u = session && session.user; if (!u) return 'BP';
    var em = u.email || '';
    if (em) return (em[0] + (em[1] || '')).toUpperCase();
    var md = (u.user_metadata || {});
    var nm = md.full_name || md.name || '';
    return nm ? nm.split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase() : 'BP';
  }
  function showApp(session) {
    var gate = $('authGate'); if (gate) gate.classList.add('hidden');
    document.body.classList.remove('locked');
    var av = $('topAvatar');
    if (av) { av.textContent = initials(session); av.title = ((session && session.user && session.user.email) || 'Signed in') + ' — click to sign out'; av.style.cursor = 'pointer'; }
  }
  function showGate() {
    var gate = $('authGate'); if (gate) gate.classList.remove('hidden');
    document.body.classList.add('locked');
  }
  async function init() {
    showGate();
    try { await loadSupabase(); }
    catch (e) { setStatus('Could not load the sign-in library. Check your connection and reload.', 'err'); return; }
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    try {
      var res = await sb.auth.getSession();
      if (res && res.data && res.data.session) showApp(res.data.session);
    } catch (e) {}

    sb.auth.onAuthStateChange(function (_evt, session) { if (session) showApp(session); else showGate(); });

    var g = $('authGoogle'); if (g) g.addEventListener('click', function () { oauth('google'); });
    var a = $('authApple'); if (a) a.addEventListener('click', function () { oauth('apple'); });
    var si = $('authSignIn'); if (si) si.addEventListener('click', signIn);
    var su = $('authSignUp'); if (su) su.addEventListener('click', signUp);
    var mg = $('authMagic'); if (mg) mg.addEventListener('click', magic);
    var pw = $('authPassword'); if (pw) pw.addEventListener('keydown', function (e) { if (e.key === 'Enter') signIn(); });
    var av = $('topAvatar'); if (av) av.addEventListener('click', signOut);
  }
  async function oauth(provider) {
    setStatus('Opening ' + (provider === 'apple' ? 'Apple' : 'Google') + '…');
    var r = await sb.auth.signInWithOAuth({ provider: provider, options: { redirectTo: location.origin + location.pathname } });
    if (r && r.error) setStatus((provider === 'apple' ? 'Apple' : 'Google') + ' sign-in is not enabled yet. Add the provider credentials in your Supabase dashboard (Authentication → Providers).', 'err');
  }
  async function signIn() {
    var email = ($('authEmail').value || '').trim(), password = $('authPassword').value || '';
    if (!email || !password) { setStatus('Enter your email and password.', 'err'); return; }
    setStatus('Signing in…');
    var r = await sb.auth.signInWithPassword({ email: email, password: password });
    if (r && r.error) setStatus(r.error.message, 'err'); else setStatus('Signed in.', 'ok');
  }
  async function signUp() {
    var email = ($('authEmail').value || '').trim(), password = $('authPassword').value || '';
    if (!email || password.length < 6) { setStatus('Enter an email and a password of at least 6 characters.', 'err'); return; }
    setStatus('Creating your account…');
    var r = await sb.auth.signUp({ email: email, password: password });
    if (r && r.error) { setStatus(r.error.message, 'err'); return; }
    if (r && r.data && r.data.session) setStatus('Account created.', 'ok');
    else setStatus('Account created — check your email to confirm, then sign in.', 'ok');
  }
  async function magic() {
    var email = ($('authEmail').value || '').trim();
    if (!email) { setStatus('Enter your email first.', 'err'); return; }
    setStatus('Sending a magic link…');
    var r = await sb.auth.signInWithOtp({ email: email, options: { emailRedirectTo: location.origin + location.pathname } });
    if (r && r.error) setStatus(r.error.message, 'err'); else setStatus('Magic link sent — check your email.', 'ok');
  }
  async function signOut() {
    if (!sb) return;
    if (!confirm('Sign out of BizPulse AI?')) return;
    await sb.auth.signOut();
    setStatus('Signed out.');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
