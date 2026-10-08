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
// анонімний id пристрою для статистики кошика (cart_events.dev): 16 випадкових символів [a-z0-9], без персональних даних
function deviceId() {
  let d = LS.get('alexbes_dev');
  if (!d || !/^[a-z0-9]{16}$/.test(d)) {
    const a = new Uint8Array(16); try { crypto.getRandomValues(a); } catch (e) { for (let i = 0; i < 16; i++) a[i] = Math.random() * 256; }
    d = Array.from(a, (x) => 'abcdefghijklmnopqrstuvwxyz0123456789'[x % 36]).join('');
    LS.set('alexbes_dev', d);
  }
  return d;
}

let fb = null, user = null, profile = {}, view = 'login', unsubUser = null, saveT = null, msg = { t: '', ok: false };

// ---- фото профілю (08.10.2026): users/{uid}.photo — data URL 256×256 (webp або jpeg), стискається на пристрої.
// Firestore, бо Storage на плані Spark недоступний (так само зберігаються фото товарів у photos/{id}).
// Якщо сервер не прийняв фото (напр., правила Firestore ще не оновлено) — фото лишається на цьому пристрої
// (localStorage, alexbes_ava_<uid>, synced:0) і тихо дозавантажується при наступному вході.
let avatar = null, avaLocal = false, avaTok = 0, serverPhoto = null, pendingPhoto = null;
const AVA_PX = 256, AVA_MAX_LEN = 180000;
const avaKey = (uid) => 'alexbes_ava_' + uid;
function localAva(uid) { try { const o = JSON.parse(LS.get(avaKey(uid)) || 'null'); return o && typeof o.d === 'string' ? o : null; } catch (e) { return null; } }
const svgI = (d, n) => '<svg viewBox="0 0 24 24" width="' + (n || 18) + '" height="' + (n || 18) + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + d + '</svg>';
const I_USER = '<circle cx="12" cy="8.2" r="3.9"/><path d="M4.6 20.2c.9-3.7 3.9-5.9 7.4-5.9s6.5 2.2 7.4 5.9"/>';
const I_CAM = '<path d="M4 8.5h3l1.6-2.5h6.8L17 8.5h3a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13.3" r="3.3"/>';
const I_TRASH = '<path d="M4.5 7h15"/><path d="M6.5 7l.9 12.2a1.3 1.3 0 0 0 1.3 1.3h6.6a1.3 1.3 0 0 0 1.3-1.3L17.5 7"/><path d="M9.5 7V4.8a.8.8 0 0 1 .8-.8h3.4a.8.8 0 0 1 .8.8V7"/><path d="M10.3 11v5.5M13.7 11v5.5"/>';
const I_CART = '<path d="M3 4h2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.1L20.5 8H6"/><circle cx="9.5" cy="19.5" r="1.3"/><circle cx="16.5" cy="19.5" r="1.3"/>';
const I_KEY = '<circle cx="8" cy="15" r="4"/><path d="m11 12 8.5-8.5M16 7l2.5 2.5M14 9l2 2"/>';
const I_GEAR = '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>';
const I_OUT = '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 16l-4-4 4-4M6 12h10"/>';
const I_ADD = '<path d="M15 19.5c-.6-2.6-2.8-4.4-6-4.4s-5.4 1.8-6 4.4"/><circle cx="9" cy="8.5" r="3.6"/><path d="M18.5 8v6M15.5 11h6"/>';

// shown photo: own upload > Google account photo > none
function shownPhoto() {
  if (!user) return null;
  if (avatar) return avatar;
  return user.photoURL && /^https:\/\//.test(user.photoURL) ? user.photoURL : null;
}

// File -> square data URL (centre crop, ≤256×256), webp (fallback jpeg), ≤ AVA_MAX_LEN chars
async function makeAvatar(file) {
  if (!file) throw new Error('none');
  if (file.type && !/^image\//.test(file.type)) throw new Error('type');
  if (file.size > 30 * 1024 * 1024) throw new Error('size');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('decode')); i.src = url; });
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) throw new Error('decode');
    const side = Math.min(w, h), out = Math.min(AVA_PX, side);
    // step-down halving keeps a big phone photo sharp at 256 px
    let src = img, sx = (w - side) / 2, sy = (h - side) / 2, ss = side;
    while (ss / 2 >= out * 1.5) {
      const c2 = document.createElement('canvas'); c2.width = c2.height = Math.round(ss / 2);
      const g2 = c2.getContext('2d'); g2.imageSmoothingQuality = 'high';
      g2.drawImage(src, sx, sy, ss, ss, 0, 0, c2.width, c2.height);
      src = c2; sx = 0; sy = 0; ss = c2.width;
    }
    const c = document.createElement('canvas'); c.width = c.height = out;
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, out, out);
    g.drawImage(src, sx, sy, ss, ss, 0, 0, out, out);
    for (const [t, q] of [['image/webp', 0.82], ['image/webp', 0.68], ['image/jpeg', 0.85], ['image/jpeg', 0.7], ['image/jpeg', 0.55]]) {
      const d = c.toDataURL(t, q);
      if (d.indexOf('data:' + t + ';base64,') === 0 && d.length <= AVA_MAX_LEN) return d;
    }
    throw new Error('size');
  } finally { URL.revokeObjectURL(url); }
}
function avaErr(e) {
  const m = e && e.message;
  if (m === 'type') return 'Це не схоже на зображення. Оберіть фото у форматі JPG, PNG або WebP.';
  if (m === 'size') return 'Фото завелике. Оберіть інше фото (до 30 МБ).';
  return 'Не вдалося прочитати фото. Спробуйте інше фото у форматі JPG або PNG.';
}

// save (data URL) or remove (null): Firestore first; if refused or no answer in 12 s — this device only
async function savePhoto(u, data) {
  const { db, F } = fb;
  if (data) LS.set(avaKey(u.uid), JSON.stringify({ d: data, synced: 0 })); else LS.del(avaKey(u.uid));
  try {
    const w = F.setDoc(F.doc(db, 'users', u.uid), { photo: data ? data : F.deleteField(), updatedAt: Date.now() }, { merge: true });
    await Promise.race([w, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 12000))]);
    if (data) LS.set(avaKey(u.uid), JSON.stringify({ d: data, synced: 1 }));
    serverPhoto = data || null;
    return 'server';
  } catch (e) {
    return data ? 'local' : 'server';   // removal: the local copy is gone either way
  }
}
function setAvatar(data, local) { avatar = data || null; avaLocal = !!(data && local); avaTok++; setBtn(); }

async function main() {
  if (!AB) return;
  try { fb = await loadFirebase(); } catch (e) { return; } // SDK blocked/offline: stay static
  const { auth, db, A, F } = fb;

  // ---- замовлення з кошика для Telegram-бота: orders/<id> (створити може будь-хто; схему перевіряють правила) ----
  if (AB.setOrderWriter) AB.setOrderWriter((id, data) => F.setDoc(F.doc(db, 'orders', id), Object.assign({}, data, { createdAt: F.serverTimestamp() })));
  // ---- власна статистика: stats/{YYYY-MM-DD} — рівно +1 до одного поля; назва поля дублюється в k (так вимагають правила) ----
  if (AB.setStatWriter) AB.setStatWriter((day, field) => F.setDoc(F.doc(db, 'stats', day), { k: field, [field]: F.increment(1) }, { merge: true }));
  // ---- 08.10: що додають у кошик — cart_events/<авто-id> (створити може будь-хто за суворою схемою; читає лише адмін) ----
  // хто: uid + ім'я з профілю / email, якщо увійшов; інакше «Гість» + анонімний id пристрою (випадковий, у localStorage)
  if (AB.setCartEventWriter) AB.setCartEventWriter((ev) => {
    const u = auth.currentUser;
    return F.addDoc(F.collection(db, 'cart_events'), Object.assign({}, ev, {
      uid: u ? u.uid : '',
      who: u ? String(profile.name || u.displayName || '').slice(0, 100) : 'Гість',
      email: u && u.email ? String(u.email).slice(0, 200) : '',
      dev: deviceId(),
      ts: F.serverTimestamp()
    }));
  });

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

  // ---- login entry point («Реєстрація»; хто вже входив на цьому пристрої — одразу вкладка «Вхід») ----
  view = LS.get('alexbes_had_acct') ? 'login' : 'signup';
  setBtn();
  $$('[data-open-acct]').forEach((b) => { b.hidden = false; });
  document.addEventListener('click', onClick);
  document.addEventListener('submit', onSubmit);
  document.addEventListener('change', onChange);
  AB.onCartChange(onLocalCart);
  if (AB.onFormChange) AB.onFormChange(onCartForm);

  A.getRedirectResult(auth).catch((e) => { msg = { t: authErr(e), ok: false }; });
  A.onAuthStateChanged(auth, onUser);
}

function setBtn() {
  const ph = shownPhoto();
  $$('[data-acct-label]').forEach((s) => {
    s.textContent = user ? ((profile.name || user.displayName || '').trim().split(/\s+/)[0] || 'Профіль') : 'Реєстрація';
  });
  $$('[data-acct-ava]').forEach((s) => {
    const cur = s.getAttribute('data-src') || '';
    if (cur === (ph || '')) return;
    s.setAttribute('data-src', ph || '');
    s.innerHTML = ph ? '<img src="' + esc(ph) + '" alt="" width="40" height="40" decoding="async" referrerpolicy="no-referrer">' : svgI(I_USER, 20);
  });
  $$('[data-open-acct]').forEach((b) => {
    b.classList.toggle('on', !!user); b.classList.toggle('has-photo', !!ph);
    b.setAttribute('aria-label', user ? 'Мій профіль' : 'Реєстрація або вхід');
  });
}

async function onUser(u) {
  const { db, F } = fb;
  if (unsubUser) { unsubUser(); unsubUser = null; }
  clearTimeout(saveT); saveT = null;
  const prev = user;
  user = u; profile = {};
  if (!u) {
    // signed out: the cart stays in the account; clear the device copy that mirrored it
    if (LS.get('alexbes_cart_uid')) { LS.del('alexbes_cart_uid'); AB.setCart([]); }
    // the photo stays in the account; drop the device copy unless it never reached the server
    if (prev) { const la = localAva(prev.uid); if (la && la.synced) LS.del(avaKey(prev.uid)); }
    avatar = null; avaLocal = false; serverPhoto = null; avaTok++;
    view = view === 'account' ? 'login' : view;
    setBtn(); render();
    return;
  }
  LS.set('alexbes_had_acct', '1');
  const la0 = localAva(u.uid);
  avatar = la0 ? la0.d : null; avaLocal = !!(la0 && !la0.synced); serverPhoto = null;
  const tok = ++avaTok;
  view = 'account'; setBtn(); render();
  const ref = F.doc(db, 'users', u.uid);
  try {
    const snap = await F.getDoc(ref);
    if (user !== u) return;
    const data = snap.exists() ? snap.data() : {};
    profile = { name: data.name || '', phone: data.phone || '', city: data.city || '', np: data.np || '' };
    serverPhoto = typeof data.photo === 'string' ? data.photo : null;
    if (tok === avaTok) {   // nobody changed the photo while we were loading
      const la = localAva(u.uid);
      if (serverPhoto) { avatar = serverPhoto; avaLocal = false; LS.set(avaKey(u.uid), JSON.stringify({ d: serverPhoto, synced: 1 })); }
      else if (la && !la.synced) {   // saved on this device earlier but not on the server yet — try again quietly
        avatar = la.d; avaLocal = true;
        savePhoto(u, la.d).then((r) => { if (user === u && r === 'server') { avaLocal = false; if (isOpen() && view === 'account') render(); } });
      } else { if (la) LS.del(avaKey(u.uid)); avatar = null; avaLocal = false; }
    }
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
      const np = { name: d.name || '', phone: d.phone || '', city: d.city || '', np: d.np || '' };
      if (!profT && ['name', 'phone', 'city', 'np'].some((k) => np[k] !== profile[k])) {   // профіль змінили на іншому пристрої
        const was = cartOf(profile), now = cartOf(np), cur = AB.getForm(), set = {};
        ['name', 'phone', 'city'].forEach((k) => { if (now[k] !== was[k] && (!cur[k] || cur[k] === was[k])) set[k] = now[k]; });
        profile = np; setBtn();
        if (Object.keys(set).length && AB.setForm) AB.setForm(set);
      }
      if (Array.isArray(d.cart) && !same(mergeCarts(d.cart, []), AB.getCart())) AB.setCart(d.cart);
      const sp = typeof d.photo === 'string' ? d.photo : null;   // photo changed on another device
      if (sp !== serverPhoto) {
        serverPhoto = sp;
        if (sp) { LS.set(avaKey(u.uid), JSON.stringify({ d: sp, synced: 1 })); setAvatar(sp, false); }
        else if (!avaLocal) { LS.del(avaKey(u.uid)); setAvatar(null, false); }
        if (view === 'account' && isOpen()) render();
      }
      if (view === 'account' && isOpen()) { const c = $('[data-cartn]'); if (c) c.textContent = cartN(); }
    }, () => {});
  } catch (e) {
    msg = { t: 'Не вдалося синхронізувати кошик: ' + authErr(e), ok: false };
  }
  setBtn(); if (isOpen()) render();
}

// ---- 08.10.2026: «Ім’я / Телефон / Місто / доставка» кошика ⇄ профіль users/{uid} (name, phone, city, np) — одне джерело ----
// Кошик має одне поле «Місто / доставка» = «місто, відділення НП»; профіль — два поля (city, np).
let profT = null;
const joinCity = (p) => [p.city, p.np].map((x) => String(x || '').trim()).filter(Boolean).join(', ');
function splitCity(s, prev) {
  s = String(s || '').trim();
  if (s === joinCity(prev)) return { city: prev.city || '', np: prev.np || '' };
  const pc = String(prev.city || '').trim();
  if (pc && s.toLowerCase().startsWith(pc.toLowerCase()) && /^($|[\s,;])/.test(s.slice(pc.length))) {
    return { city: pc, np: s.slice(pc.length).replace(/^[\s,;]+/, '').slice(0, 120) };
  }
  const i = s.indexOf(',');
  return i < 0 ? { city: s.slice(0, 120), np: '' } : { city: s.slice(0, i).trim().slice(0, 120), np: s.slice(i + 1).trim().slice(0, 120) };
}
const cartOf = (p) => ({ name: p.name || '', phone: p.phone || '', city: joinCity(p) });
// поля кошика змінились (введення — із затримкою; оформлене замовлення — одразу) → оновити профіль; порожні поля профіль не стирають
function onCartForm(f, kind) {
  if (!user) return;   // гість — нічого не синхронізуємо
  const u = user;
  clearTimeout(profT); profT = null;
  const run = () => {
    profT = null;
    if (user !== u) return;
    const patch = {}, name = String(f.name || '').trim().slice(0, 100), phone = String(f.phone || '').trim().slice(0, 40), city = String(f.city || '').trim();
    if (name && name !== profile.name) patch.name = name;
    if (phone && phone !== profile.phone) patch.phone = phone;
    if (city && city !== joinCity(profile)) { const c = splitCity(city, profile); if (c.city !== profile.city) patch.city = c.city; if (c.np !== profile.np) patch.np = c.np; }
    if (!Object.keys(patch).length) return;
    Object.assign(profile, patch); setBtn();
    fb.F.setDoc(fb.F.doc(fb.db, 'users', u.uid), Object.assign({}, patch, { updatedAt: Date.now() }), { merge: true }).catch(() => {});
    if (isOpen() && view === 'account' && !document.activeElement?.closest?.('[data-form="profile"]')) render();
  };
  if (kind === 'order') run(); else profT = setTimeout(run, 1200);
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
      '<h2 id="acct-ttl" class="acct__ttl">' + svgI(I_USER, 22) + '<span>Мій профіль</span></h2>' +
      photoField('account') +
      (!user.emailVerified && pw ? '<p class="acct__warn">Email ще не підтверджено. Перевірте пошту (і «Спам»). <button type="button" class="acct__link" data-a="verify">Надіслати лист ще раз</button></p>' : '') +
      '<p class="acct__ok acct__ok--ic">' + svgI(I_CART, 18) + '<span>Кошик збережено в акаунті: <b data-cartn>' + cartN() + '</b> шт. Він доступний на всіх ваших пристроях.</span></p>' +
      '<form class="acct__form cform" data-form="profile" novalidate>' +
        '<p class="acct__sub full">Дані для замовлень <span class="muted small">(необов’язково)</span></p>' +
        '<label>Ім’я<input name="name" maxlength="100" autocomplete="name" value="' + esc(profile.name) + '"></label>' +
        '<label>Телефон<input name="phone" maxlength="40" type="tel" autocomplete="tel" value="' + esc(profile.phone) + '" placeholder="099 123 45 67"></label>' +
        '<label>Місто<input name="city" maxlength="120" autocomplete="address-level2" value="' + esc(profile.city) + '"></label>' +
        '<label>Відділення Нової пошти<input name="np" maxlength="120" value="' + esc(profile.np) + '" placeholder="№ відділення або поштомату"></label>' +
        '<p class="full muted small acct__ok--ic" style="margin:0">' + svgI(I_CART, 16) + '<span>Ці дані підставляються в кошик під час замовлення, а зміни з кошика зберігаються тут.</span></p>' +
        '<button class="btn btn--y btn--full full" type="submit">Зберегти профіль</button>' +
      '</form>' + msgHTML() +
      '<div class="acct__acts">' +
        (adm ? '<a class="btn btn--b btn--full" href="admin.html' + emu + '" data-admin-link>' + svgI(I_GEAR, 18) + ' Адмінка</a>' :
          (user.email && user.email.toLowerCase() === ADMIN_EMAIL ? '<p class="acct__warn">Підтвердьте email, щоб відкрити адмінку.</p>' : '')) +
        '<button class="btn btn--o btn--full" type="button" data-a="logout">' + svgI(I_OUT, 18) + ' Вийти</button>' +
      '</div>';
    return;
  }
  const tabs = '<div class="acct__tabs" role="tablist"><button type="button" role="tab" data-a="v-login" class="' + (view === 'login' ? 'on' : '') + '">Вхід</button><button type="button" role="tab" data-a="v-signup" class="' + (view === 'signup' ? 'on' : '') + '">Реєстрація</button></div>';
  let body = '';
  if (view === 'reset') {
    body = '<h2 id="acct-ttl" class="acct__ttl">' + svgI(I_KEY, 22) + '<span>Відновлення пароля</span></h2>' +
      '<p class="acct__lead">Вкажіть email — надішлемо лист із посиланням для створення нового пароля.</p>' +
      '<form class="acct__form" data-form="reset" novalidate>' +
        '<label>Email<input name="email" type="email" autocomplete="email" required></label>' +
        '<button class="btn btn--y btn--full" type="submit">Надіслати лист</button>' +
      '</form>' + msgHTML() +
      '<p class="acct__center"><button type="button" class="acct__link" data-a="v-login">← Назад до входу</button></p>';
  } else {
    const su = view === 'signup';
    body = '<h2 id="acct-ttl" class="acct__ttl">' + svgI(su ? I_ADD : I_USER, 22) + '<span>' + (su ? 'Реєстрація' : 'Вхід в акаунт') + '</span></h2>' +
      '<p class="acct__lead">Кошик зберігатиметься в акаунті й буде доступний на всіх ваших пристроях.</p>' +
      '<button class="btn btn--g btn--full" type="button" data-a="google">' + G_ICON + ' Увійти через Google</button>' +
      '<div class="acct__or"><span>або email і пароль</span></div>' + tabs +
      '<form class="acct__form" data-form="' + (su ? 'signup' : 'login') + '" novalidate>' +
        (su ? photoField('signup') + '<label>Ім’я <span class="muted small">(необов’язково)</span><input name="name" maxlength="100" autocomplete="name"></label>' : '') +
        '<label>Email<input name="email" type="email" autocomplete="email" required></label>' +
        '<label>Пароль' + (su ? ' <span class="muted small">(щонайменше 6 символів)</span>' : '') + '<input name="password" type="password" minlength="6" autocomplete="' + (su ? 'new-password' : 'current-password') + '" required></label>' +
        '<button class="btn btn--y btn--full" type="submit">' + (su ? 'Зареєструватися' : 'Увійти') + '</button>' +
      '</form>' + msgHTML() +
      (su ? '' : '<p class="acct__center"><button type="button" class="acct__link" data-a="v-reset">Забули пароль?</button></p>');
  }
  box.innerHTML = body;
}

// photo block: signup form (before the account exists) and «Мій профіль»
function photoField(ctx) {
  const acc = ctx === 'account', src = acc ? shownPhoto() : pendingPhoto, own = acc ? !!avatar : !!pendingPhoto;
  const nm = acc ? (profile.name || user.displayName || 'Покупець') : '';
  const pic = '<span class="avaf__pic' + (src ? ' has' : '') + '">' + (src ? '<img src="' + esc(src) + '" alt="Фото профілю" referrerpolicy="no-referrer">' : svgI(I_USER, acc ? 30 : 28)) + '</span>';
  const btns = '<div class="avaf__btns">' +
    '<label class="avaf__btn">' + svgI(I_CAM, 16) + '<span>' + (own ? 'Змінити фото' : 'Додати фото') + '</span><input class="avaf__file" type="file" accept="image/*" data-ava-input></label>' +
    (own ? '<button type="button" class="avaf__btn avaf__btn--o" data-a="ava-del">' + svgI(I_TRASH, 16) + '<span>Видалити</span></button>' : '') +
    '</div>';
  const note = acc ? (avaLocal ? '<p class="avaf__note">Фото збережено лише на цьому пристрої — на інших пристроях воно поки не відображатиметься.</p>' : '')
    : '<p class="avaf__note">Необов’язково. Фото зменшимо до 256×256 прямо на вашому пристрої.</p>';
  return '<div class="avaf avaf--' + ctx + '" data-avaf>' + pic + '<div class="avaf__txt">' +
    (acc ? '<b>' + esc(nm) + '</b><span class="avaf__mail">' + esc(user.email || '') + '</span>' : '<b>Фото профілю</b>') +
    btns + note + '</div></div>';
}
function refreshPhotoField() {
  const el = $('#acctbody [data-avaf]'); if (!el) return;
  const ctx = el.classList.contains('avaf--account') ? 'account' : 'signup';
  el.outerHTML = photoField(ctx);
}

async function onChange(e) {
  const inp = e.target.closest && e.target.closest('#acctbody [data-ava-input]'); if (!inp) return;
  const file = inp.files && inp.files[0]; inp.value = '';
  if (!file) return;
  const wrap = inp.closest('[data-avaf]'); if (wrap) wrap.classList.add('busy');
  let data;
  try { data = await makeAvatar(file); } catch (err) { if (wrap) wrap.classList.remove('busy'); say(avaErr(err)); return; }
  if (!user) { pendingPhoto = data; say(''); refreshPhotoField(); return; }
  const u = user;
  setAvatar(data, true); refreshPhotoField();
  const r = await savePhoto(u, data);
  if (user !== u) return;
  avaLocal = r !== 'server'; refreshPhotoField(); setBtn();
  say(r === 'server' ? 'Фото профілю збережено.' : 'Фото збережено на цьому пристрої — на інших пристроях воно поки не відображатиметься.', r === 'server');
  AB.track('акаунт/фото', 'Фото профілю');
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
    try { const r = await googleSignIn(fb); if (r) { AB.track('акаунт/вхід-google', 'Вхід через Google'); AB.toast('Ви увійшли'); } } catch (err) { say(authErr(err)); }
    return;
  }
  if (a === 'ava-del') {
    if (!user) { pendingPhoto = null; refreshPhotoField(); return; }
    const u = user; setAvatar(null, false); refreshPhotoField();
    await savePhoto(u, null);
    if (user === u) say('Фото профілю видалено.', true);
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
      AB.track('акаунт/вхід', 'Вхід email'); AB.toast('Ви увійшли');
    } else if (kind === 'signup') {
      if (f.elements.password.value.length < 6) throw { code: 'auth/weak-password' };
      const cred = await A.createUserWithEmailAndPassword(auth, v('email'), f.elements.password.value);
      const name = v('name');
      if (name) { await A.updateProfile(cred.user, { displayName: name }); profile.name = name; await F.setDoc(F.doc(db, 'users', cred.user.uid), { name, updatedAt: Date.now() }, { merge: true }); }
      if (pendingPhoto) {   // separate write: a refused photo must not cost the name
        const ph = pendingPhoto; pendingPhoto = null;
        setAvatar(ph, true);
        const r = await savePhoto(cred.user, ph);
        if (user === cred.user || !user) { avaLocal = r !== 'server'; }
      }
      A.sendEmailVerification(cred.user).catch(() => {});
      AB.track('акаунт/реєстрація', 'Реєстрація'); AB.toast('Акаунт створено. Перевірте пошту для підтвердження');
      setBtn(); render();
    } else if (kind === 'reset') {
      if (!v('email')) throw { code: 'auth/missing-email' };
      await A.sendPasswordResetEmail(auth, v('email'));
      say('Якщо такий акаунт існує, лист для відновлення надіслано на ' + v('email') + '. Перевірте також «Спам».', true);
    } else if (kind === 'profile') {
      const p = { name: v('name').slice(0, 100), phone: v('phone').slice(0, 40), city: v('city').slice(0, 120), np: v('np').slice(0, 120) };
      await F.setDoc(F.doc(db, 'users', user.uid), Object.assign({}, p, { updatedAt: Date.now() }), { merge: true });
      clearTimeout(profT); profT = null;
      profile = p; setBtn();
      // профіль збережено явно → ці дані стають даними кошика (порожні поля профілю кошик не стирають)
      const cf = cartOf(p), set = {}; ['name', 'phone', 'city'].forEach((k) => { if (cf[k]) set[k] = cf[k]; });
      if (AB.setForm) AB.setForm(set); else AB.fillForm(cf);
      msg = { t: 'Профіль збережено.', ok: true }; render(); return;
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
