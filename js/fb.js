/* Alex_bes😈 — акаунти, кошик в акаунті, товари з Firestore. Необов'язковий шар:
   якщо Firebase не завантажився (блокувальник, офлайн) — сайт працює зі статичних даних як раніше. */
import { loadFirebase, isAdminUser, authErr, googleSignIn, esc, ADMIN_EMAIL } from './fb-common.js?v=1';

const AB = window.AlexBes;
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const LS = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};

// Merge: same product+variant -> quantities summed; everything else appended (no duplicates).
export function mergeCarts(a, b) {
  const out = [];
  [].concat(a || [], b || []).forEach((l) => {
    if (!l || typeof l.id !== 'string') return;
    const vi = Math.max(0, parseInt(l.vi, 10) || 0), qty = Math.max(1, parseInt(l.qty, 10) || 1);
    const ex = out.find((x) => x.id === l.id && x.vi === vi);
    if (ex) ex.qty = Math.min(9999, ex.qty + qty); else out.push({ id: l.id, vi, qty });
  });
  return out;
}
const same = (a, b) => JSON.stringify(a || []) === JSON.stringify(b || []);

let fb = null, user = null, profile = {}, view = 'login', unsubUser = null, saveT = null, msg = { t: '', ok: false };

async function main() {
  if (!AB) return;
  try { fb = await loadFirebase(); } catch (e) { return; } // SDK blocked/offline: stay static
  const { auth, db, A, F } = fb;

  // ---- замовлення з кошика для Telegram-бота: orders/<id> (створити може будь-хто; схему перевіряють правила) ----
  if (AB.setOrderWriter) AB.setOrderWriter((id, data) => F.setDoc(F.doc(db, 'orders', id), Object.assign({}, data, { createdAt: F.serverTimestamp() })));
  // ---- власна статистика: stats/{YYYY-MM-DD} — рівно +1 до одного поля; назва поля дублюється в k (так вимагають правила) ----
  if (AB.setStatWriter) AB.setStatWriter((day, field) => F.setDoc(F.doc(db, 'stats', day), { k: field, [field]: F.increment(1) }, { merge: true }));

  // ---- products from Firestore (public read) ----
  AB.setPhotoLoader(async (id) => {
    const s = await F.getDoc(F.doc(db, 'photos', id));
    return s.exists() ? s.data().data : null;
  });
  F.getDocs(F.collection(db, 'products')).then((qs) => {
    const docs = qs.docs.map((d) => Object.assign({}, d.data(), { id: d.id }));
    AB.applyRemote(docs);
    LS.set('alexbes_remote', JSON.stringify({ t: Date.now(), docs }));
  }).catch(() => {});

  // ---- login entry point ----
  $$('[data-open-acct]').forEach((b) => { b.hidden = false; });
  document.addEventListener('click', onClick);
  document.addEventListener('submit', onSubmit);
  AB.onCartChange(onLocalCart);

  A.getRedirectResult(auth).catch((e) => { msg = { t: authErr(e), ok: false }; });
  A.onAuthStateChanged(auth, onUser);
}

function setBtn() {
  $$('[data-acct-label]').forEach((s) => {
    s.textContent = user ? ((profile.name || user.displayName || '').split(' ')[0] || 'Акаунт') : 'Увійти';
  });
  $$('[data-open-acct]').forEach((b) => { b.classList.toggle('on', !!user); b.setAttribute('aria-label', user ? 'Мій акаунт' : 'Увійти в акаунт'); });
}

async function onUser(u) {
  const { db, F } = fb;
  if (unsubUser) { unsubUser(); unsubUser = null; }
  clearTimeout(saveT); saveT = null;
  user = u; profile = {};
  if (!u) {
    // signed out: the cart stays in the account; clear the device copy that mirrored it
    if (LS.get('alexbes_cart_uid')) { LS.del('alexbes_cart_uid'); AB.setCart([]); }
    view = view === 'account' ? 'login' : view;
    setBtn(); render();
    return;
  }
  view = 'account'; setBtn(); render();
  const ref = F.doc(db, 'users', u.uid);
  try {
    const snap = await F.getDoc(ref);
    if (user !== u) return;
    const data = snap.exists() ? snap.data() : {};
    profile = { name: data.name || '', phone: data.phone || '', city: data.city || '', np: data.np || '' };
    const local = AB.getCart();
    const firstOnDevice = LS.get('alexbes_cart_uid') !== u.uid;
    // first sign-in on this device: merge the guest cart into the saved one; later loads: the account copy wins
    const merged = firstOnDevice ? mergeCarts(data.cart || [], local) : (Array.isArray(data.cart) ? mergeCarts(data.cart, []) : local);
    AB.setCart(merged);
    LS.set('alexbes_cart_uid', u.uid);
    const patch = {};
    if (!same(merged, data.cart)) patch.cart = merged;
    if (u.email && data.email !== u.email) patch.email = u.email;
    if (Object.keys(patch).length) { patch.updatedAt = Date.now(); await F.setDoc(ref, patch, { merge: true }); }
    AB.fillForm({ name: profile.name, phone: profile.phone, city: [profile.city, profile.np].filter(Boolean).join(', ') });
    // real-time: changes from other devices
    unsubUser = F.onSnapshot(ref, (s) => {
      if (s.metadata.hasPendingWrites || saveT || user !== u || !s.exists()) return;
      const d = s.data();
      if (Array.isArray(d.cart) && !same(mergeCarts(d.cart, []), AB.getCart())) AB.setCart(d.cart);
      if (view === 'account' && isOpen()) { const c = $('[data-cartn]'); if (c) c.textContent = cartN(); }
    }, () => {});
  } catch (e) {
    msg = { t: 'Не вдалося синхронізувати кошик: ' + authErr(e), ok: false };
  }
  setBtn(); if (isOpen()) render();
}

function onLocalCart(lines) {
  if (!user) return;
  const u = user;
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    saveT = null;
    if (user !== u) return;
    fb.F.setDoc(fb.F.doc(fb.db, 'users', u.uid), { cart: AB.getCart(), updatedAt: Date.now() }, { merge: true }).catch(() => {});
  }, 400);
}

const cartN = () => AB.getCart().reduce((s, l) => s + l.qty, 0);
const isOpen = () => { const m = $('#amodal'); return m && !m.hidden; };

const G_ICON = '<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';

function msgHTML() { return '<p class="acct__msg' + (msg.ok ? ' ok' : '') + '" role="alert"' + (msg.t ? '' : ' hidden') + '>' + esc(msg.t) + '</p>'; }

function render() {
  const box = $('#acctbody'); if (!box) return;
  if (user) {
    const adm = isAdminUser(user);
    const pw = user.providerData.some((p) => p.providerId === 'password');
    const emu = fb && fb.emu ? '?emu=1' : '';
    box.innerHTML =
      '<h2 id="acct-ttl">👤 Мій акаунт</h2>' +
      '<div class="acct__who"><span class="acct__ava">' + esc(((profile.name || user.displayName || user.email || '?').trim()[0] || '?').toUpperCase()) + '</span>' +
        '<div><b>' + esc(profile.name || user.displayName || 'Покупець') + '</b><span>' + esc(user.email || '') + '</span></div></div>' +
      (!user.emailVerified && pw ? '<p class="acct__warn">Email ще не підтверджено. Перевірте пошту (і «Спам»). <button type="button" class="acct__link" data-a="verify">Надіслати лист ще раз</button></p>' : '') +
      '<p class="acct__ok">🛒 Кошик збережено в акаунті: <b data-cartn>' + cartN() + '</b> шт. Він доступний на всіх ваших пристроях.</p>' +
      '<form class="acct__form cform" data-form="profile" novalidate>' +
        '<p class="acct__sub full">Дані для замовлень <span class="muted small">(необов’язково)</span></p>' +
        '<label>Ім’я<input name="name" maxlength="100" autocomplete="name" value="' + esc(profile.name) + '"></label>' +
        '<label>Телефон<input name="phone" maxlength="40" type="tel" autocomplete="tel" value="' + esc(profile.phone) + '" placeholder="099 123 45 67"></label>' +
        '<label>Місто<input name="city" maxlength="120" autocomplete="address-level2" value="' + esc(profile.city) + '"></label>' +
        '<label>Відділення Нової пошти<input name="np" maxlength="120" value="' + esc(profile.np) + '" placeholder="№ відділення або поштомату"></label>' +
        '<button class="btn btn--y btn--full full" type="submit">💾 Зберегти профіль</button>' +
      '</form>' + msgHTML() +
      '<div class="acct__acts">' +
        (adm ? '<a class="btn btn--b btn--full" href="admin.html' + emu + '" data-admin-link>⚙️ Адмінка</a>' :
          (user.email && user.email.toLowerCase() === ADMIN_EMAIL ? '<p class="acct__warn">Підтвердьте email, щоб відкрити адмінку.</p>' : '')) +
        '<button class="btn btn--o btn--full" type="button" data-a="logout">🚪 Вийти</button>' +
      '</div>';
    return;
  }
  const tabs = '<div class="acct__tabs" role="tablist"><button type="button" role="tab" data-a="v-login" class="' + (view === 'login' ? 'on' : '') + '">Вхід</button><button type="button" role="tab" data-a="v-signup" class="' + (view === 'signup' ? 'on' : '') + '">Реєстрація</button></div>';
  let body = '';
  if (view === 'reset') {
    body = '<h2 id="acct-ttl">🔑 Відновлення пароля</h2>' +
      '<p class="acct__lead">Вкажіть email — надішлемо лист із посиланням для створення нового пароля.</p>' +
      '<form class="acct__form" data-form="reset" novalidate>' +
        '<label>Email<input name="email" type="email" autocomplete="email" required></label>' +
        '<button class="btn btn--y btn--full" type="submit">Надіслати лист</button>' +
      '</form>' + msgHTML() +
      '<p class="acct__center"><button type="button" class="acct__link" data-a="v-login">← Назад до входу</button></p>';
  } else {
    const su = view === 'signup';
    body = '<h2 id="acct-ttl">👤 ' + (su ? 'Реєстрація' : 'Вхід в акаунт') + '</h2>' +
      '<p class="acct__lead">Кошик зберігатиметься в акаунті й буде доступний на всіх ваших пристроях.</p>' +
      '<button class="btn btn--g btn--full" type="button" data-a="google">' + G_ICON + ' Увійти через Google</button>' +
      '<div class="acct__or"><span>або email і пароль</span></div>' + tabs +
      '<form class="acct__form" data-form="' + (su ? 'signup' : 'login') + '" novalidate>' +
        (su ? '<label>Ім’я <span class="muted small">(необов’язково)</span><input name="name" maxlength="100" autocomplete="name"></label>' : '') +
        '<label>Email<input name="email" type="email" autocomplete="email" required></label>' +
        '<label>Пароль' + (su ? ' <span class="muted small">(щонайменше 6 символів)</span>' : '') + '<input name="password" type="password" minlength="6" autocomplete="' + (su ? 'new-password' : 'current-password') + '" required></label>' +
        '<button class="btn btn--y btn--full" type="submit">' + (su ? 'Зареєструватися' : 'Увійти') + '</button>' +
      '</form>' + msgHTML() +
      (su ? '' : '<p class="acct__center"><button type="button" class="acct__link" data-a="v-reset">Забули пароль?</button></p>');
  }
  box.innerHTML = body;
}

function say(t, ok) { msg = { t, ok: !!ok }; const p = $('.acct__msg'); if (p) { p.textContent = t; p.hidden = !t; p.classList.toggle('ok', !!ok); } }
function busy(f, on) { $$('button, input', f).forEach((el) => { el.disabled = on; }); }

async function onClick(e) {
  const t = e.target.closest('[data-open-acct], [data-a]'); if (!t) return;
  if (t.hasAttribute('data-open-acct')) { e.preventDefault(); msg = { t: '', ok: false }; render(); AB.showModal('#amodal'); return; }
  const a = t.getAttribute('data-a');
  const { auth, A } = fb;
  if (a === 'v-login' || a === 'v-signup' || a === 'v-reset') { const em = $('#acctbody input[name=email]'); view = a.slice(2); msg = { t: '', ok: false }; render(); if (em && em.value) { const n = $('#acctbody input[name=email]'); if (n) n.value = em.value; } return; }
  if (a === 'google') {
    say('', false);
    try { const r = await googleSignIn(fb); if (r) { AB.track('акаунт/вхід-google', 'Вхід через Google'); AB.toast('Ви увійшли ✅'); } } catch (err) { say(authErr(err)); }
    return;
  }
  if (a === 'logout') { await A.signOut(auth); AB.toast('Ви вийшли з акаунта'); return; }
  if (a === 'verify') { try { await A.sendEmailVerification(user); say('Лист надіслано на ' + user.email, true); } catch (err) { say(authErr(err)); } }
}

async function onSubmit(e) {
  const f = e.target.closest('#acctbody form[data-form]'); if (!f) return;
  e.preventDefault();
  const kind = f.getAttribute('data-form'), v = (n) => (f.elements[n] ? f.elements[n].value.trim() : '');
  const { auth, A, db, F } = fb;
  busy(f, true); say('');
  try {
    if (kind === 'login') {
      await A.signInWithEmailAndPassword(auth, v('email'), f.elements.password.value);
      AB.track('акаунт/вхід', 'Вхід email'); AB.toast('Ви увійшли ✅');
    } else if (kind === 'signup') {
      if (f.elements.password.value.length < 6) throw { code: 'auth/weak-password' };
      const cred = await A.createUserWithEmailAndPassword(auth, v('email'), f.elements.password.value);
      const name = v('name');
      if (name) { await A.updateProfile(cred.user, { displayName: name }); profile.name = name; await F.setDoc(F.doc(db, 'users', cred.user.uid), { name, updatedAt: Date.now() }, { merge: true }); }
      A.sendEmailVerification(cred.user).catch(() => {});
      AB.track('акаунт/реєстрація', 'Реєстрація'); AB.toast('Акаунт створено ✅ Перевірте пошту для підтвердження');
      setBtn(); render();
    } else if (kind === 'reset') {
      if (!v('email')) throw { code: 'auth/missing-email' };
      await A.sendPasswordResetEmail(auth, v('email'));
      say('Якщо такий акаунт існує, лист для відновлення надіслано на ' + v('email') + '. Перевірте також «Спам».', true);
    } else if (kind === 'profile') {
      const p = { name: v('name').slice(0, 100), phone: v('phone').slice(0, 40), city: v('city').slice(0, 120), np: v('np').slice(0, 120) };
      await F.setDoc(F.doc(db, 'users', user.uid), Object.assign({}, p, { updatedAt: Date.now() }), { merge: true });
      profile = p; setBtn();
      AB.fillForm({ name: p.name, phone: p.phone, city: [p.city, p.np].filter(Boolean).join(', ') });
      msg = { t: 'Профіль збережено ✅', ok: true }; render(); return;
    }
  } catch (err) { say(authErr(err)); }
  if (f.isConnected) busy(f, false);
}

// Firebase (~300 КБ SDK) стартує після завантаження сторінки, у вільну хвилину (≤ 2,5 с), або одразу при першій дії користувача —
// перший екран не чекає на SDK; останні відомі зміни товарів сайт уже показує з localStorage.
(function () {
  let started = false;
  const go = () => { if (started) return; started = true; EV.forEach((e) => removeEventListener(e, go, true)); main(); };
  const EV = ['pointerdown', 'keydown', 'touchstart'];
  EV.forEach((e) => addEventListener(e, go, { capture: true, passive: true }));
  if (/^#(account|cart)|^#\/p\//.test(location.hash)) { go(); return; } // акаунт / кошик / товар за посиланням — одразу
  const idle = () => (window.requestIdleCallback ? requestIdleCallback(go, { timeout: 2500 }) : setTimeout(go, 1200));
  if (document.readyState === 'complete') idle(); else addEventListener('load', idle, { once: true });
})();
