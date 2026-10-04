/* ==== local sign-in (privacy: kept only in this browser) ==== */
(function () {
  var ACCT = 'bizpulse.account.v1';
  var SESS = 'bizpulse.session.v1';
  function $(id) { return document.getElementById(id); }
  function read(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function setStatus(msg, kind) {
    var s = $('authStatus'); if (!s) return;
    s.classList.remove('hidden', 'err', 'ok'); if (kind) s.classList.add(kind);
    s.textContent = msg;
  }
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
  function initials(email) { return email ? (email[0] + (email[1] || '')).toUpperCase() : 'BP'; }
  function showApp(acct) {
    var g = $('authGate'); if (g) g.classList.add('hidden');
    document.body.classList.remove('locked');
    var av = $('topAvatar');
    if (av) { av.textContent = initials(acct && acct.email); av.title = ((acct && acct.email) || 'Signed in') + ' — click to sign out'; av.style.cursor = 'pointer'; }
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
    var acct = read(ACCT);
    var email = ($('authEmail').value || '').trim().toLowerCase();
    var pw = $('authPassword').value || '';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setStatus('Enter a valid email address.', 'err'); return; }
    if (pw.length < 6) { setStatus('Password must be at least 6 characters.', 'err'); return; }
    if (!acct) {
      if (pw !== ($('authConfirm').value || '')) { setStatus('The passwords do not match.', 'err'); return; }
      setStatus('Creating your account…');
      var salt = rand(16);
      var h = await hash(pw, salt);
      acct = { email: email, salt: salt, hash: h };
      write(ACCT, acct);
      write(SESS, { email: email });
      setStatus('Account created.', 'ok');
      showApp(acct);
      return;
    }
    if (email !== acct.email) { setStatus('That is not the email set up on this device.', 'err'); return; }
    setStatus('Signing in…');
    var hh = await hash(pw, acct.salt);
    if (hh === acct.hash) { write(SESS, { email: acct.email }); setStatus('Signed in.', 'ok'); showApp(acct); }
    else setStatus('Incorrect password.', 'err');
  }
  function reset() {
    if (!confirm('Reset sign-in on this device? This deletes the local account and signs you out. Your business data is not touched.')) return;
    del(ACCT); del(SESS);
    $('authPassword').value = ''; $('authConfirm').value = '';
    setMode('create');
    setStatus('Local sign-in reset — create a new one.', 'ok');
  }
  function signOut() {
    if (!confirm('Sign out of BizPulse AI?')) return;
    del(SESS);
    showGate();
    setMode(read(ACCT) ? 'signin' : 'create');
    setStatus('Signed out.');
  }
  function init() {
    var acct = read(ACCT), sess = read(SESS);
    if (acct && sess && sess.email === acct.email) showApp(acct);
    else { showGate(); setMode(acct ? 'signin' : 'create'); }
    var sub = $('authSubmit'); if (sub) sub.addEventListener('click', submit);
    var rp = $('authPassword'); if (rp) rp.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    var rc = $('authConfirm'); if (rc) rc.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    var rs = $('authReset'); if (rs) rs.addEventListener('click', reset);
    var av = $('topAvatar'); if (av) av.addEventListener('click', signOut);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
