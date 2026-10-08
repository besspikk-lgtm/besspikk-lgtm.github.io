/* Alex_bes😈 — адмінка товарів. Доступ: лише besspikk@gmail.com (перевірка в UI + правила Firestore). */
import { loadFirebase, isAdminUser, authErr, googleSignIn, esc, ADMIN_EMAIL } from './fb-common.js?v=1';
import { initAdminExtras, startOrders, stopOrders, renderOrders, loadStats, extrasClick, extrasChange, extrasInput } from './admin-orders.js?v=6';

const DATA = window.ALEXBES_DATA || { categories: [], products: [] };
const CATS = DATA.categories;
const catById = Object.fromEntries(CATS.map((c) => [c.id, c]));
const BASE = Object.fromEntries(DATA.products.map((p) => [p.id, p]));
// Same as PROMO in js/app.js (static badges); Firestore field `promo` overrides it.
const PROMO = { 'meiji-finer-core-liberty-walk': 'Новинка · Ексклюзив', 'meiji-finer-core-black': 'Ексклюзив', 'ntools-5000b-upgrades': 'Новинка', 'ntools-te20': 'Новинка', 'spi-pro-te20-sticker-bomb': 'Новинка', 'ntools-mini-5002': 'Новинка', 'sata-jet-x-pro': 'Акція', 'antistatic-easy-paint': 'ХІТ' };
const STOCKS = ['В наявності', 'Немає в наявності', 'Наявність уточнюйте', 'Під замовлення', 'У дорозі'];
DATA.products.forEach((p) => { if (p.in_stock && !STOCKS.includes(p.in_stock)) STOCKS.push(p.in_stock); });
const PLACEHOLDER = 'img/logo.webp?v=3';
const FIELDS = ['name', 'category', 'price_eur', 'price_old_eur', 'price_label', 'in_stock', 'description', 'promo', 'variants', 'code', 'videos'];
const MEDIA = window.AlexBesMedia;
const MAX_PH = 10, MAX_VID = 5;
// gallery = ordered photo keys: 'static' = catalog img/p photo, 'main' = photos/{id} (first admin photo), other = photos/{id}__{key}
const phDoc = (id, k) => (k === 'main' ? id : id + '__' + k);
function effGallery(id, r) {
  if (r && Array.isArray(r.gallery)) return r.gallery.filter((k) => typeof k === 'string' && (k !== 'static' || BASE[id]));
  if (r && r.hasPhoto) return ['main'];
  return BASE[id] ? ['static'] : [];
}
const MAX_PHOTO = 700 * 1024, HARD_MAX = 990000;

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const nf = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 2 });
const eur = (v) => nf.format(v).replace(/\u202f|\u00a0/g, ' ') + ' €';
// курс для показу на сайті (має збігатися з CONFIG.uahRate у js/app.js): ціни вводяться і зберігаються в €, сайт показує € × 52 грн
const UAH_RATE = 52;
const uahOf = (v) => String(Math.round(Number(v) * UAH_RATE)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' грн';
const uahHint = (v) => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) && n >= 0 && String(v).trim() !== '' ? '≈ ' + uahOf(n) + ' на сайті' : ''; };
/* ---------- знижки (08.10.2026): стара ціна (перекреслена) + нова; ті самі правила, що в js/app.js і _work/discount.py ----------
   price_eur — нова (поточна) ціна, price_old_eur — стара (null = без знижки); у варіантів так само.
   Нова = стара в грн × (100 − N) / 100, округлено вниз до цілої гривні; зберігається як грн / 52 (4 знаки). */
const toUah = (v) => Math.round(Number(v) * UAH_RATE);
const discEur = (old, pct) => Math.round(Math.floor(toUah(old) * (100 - pct) / 100) / UAH_RATE * 1e4) / 1e4;
const oldOf = (o) => (o && o.price_old_eur != null && o.price_eur != null && toUah(o.price_old_eur) > toUah(o.price_eur) ? Number(o.price_old_eur) : null);
const pctOf = (old, now) => Math.round((1 - toUah(now) / toUah(old)) * 100);
const hasDisc = (p) => !!(oldOf(p) || (p.variants || []).some(oldOf));
// старі правки ціни (без ключа price_old_eur) для товару зі знижкою в каталозі: ціна з адмінки = стара, знижка — до неї
function discNorm(b, d) {
  const pct = b && b.disc_pct;
  if (!pct || !d || d.price_old_eur !== undefined || (d.price_eur === undefined && d.variants === undefined)) return d;
  d = Object.assign({}, d);
  if (d.price_eur !== undefined) { if (d.price_eur == null) d.price_old_eur = null; else { d.price_old_eur = Number(d.price_eur); d.price_eur = discEur(d.price_eur, pct); } }
  if (Array.isArray(d.variants)) d.variants = d.variants.map((v) => (!v || v.price_eur == null || v.price_old_eur != null ? v : Object.assign({}, v, { price_old_eur: v.price_eur, price_eur: discEur(v.price_eur, pct) })));
  return d;
}
const IC_TAG = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>';
const IC_UNDO = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>';
let tt; function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => { t.hidden = true; }, 2800); }

let fb, user = null, remote = {}, photoCache = {}, unsub = null, edit = null;

/* ---------- data ---------- */
function baseVals(id) {
  const b = BASE[id]; if (!b) return null;
  return { name: b.name, category: b.category, price_eur: b.price_eur ?? null, price_old_eur: b.price_old_eur ?? null, price_label: b.price_label || '', in_stock: b.in_stock || '',
    description: b.description || '', promo: PROMO[id] || '', variants: b.variants || null, code: b.code || '', videos: Array.isArray(b.videos) && b.videos.length ? b.videos.slice() : null };
}
function merged() {
  const out = [];
  const add = (id) => {
    const r = remote[id], b = baseVals(id);
    const v = Object.assign({ name: '', category: '', price_eur: null, price_old_eur: null, price_label: '', in_stock: 'Наявність уточнюйте', description: '', promo: '', variants: null, code: '' }, b || {});
    if (r) { const rn = discNorm(BASE[id], r); FIELDS.forEach((k) => { if (rn[k] !== undefined) v[k] = rn[k]; }); }
    const gallery = effGallery(id, r);
    out.push(Object.assign(v, { id, isStatic: !!b, changed: !!(b && r && FIELDS.some((k) => r[k] !== undefined)), hidden: r && r.hidden !== undefined ? !!r.hidden : !!(b && BASE[id] && BASE[id].hidden), hasPhoto: !!(r && r.hasPhoto),
      gallery, photoChanged: !!(b && JSON.stringify(gallery) !== '["static"]'),
      photo: b ? BASE[id].photo : PLACEHOLDER, createdAt: (r && r.createdAt) || 0 }));
  };
  DATA.products.forEach((p) => add(p.id));
  Object.keys(remote).filter((id) => !BASE[id]).sort((a, b) => (remote[a].createdAt || 0) - (remote[b].createdAt || 0)).forEach(add);
  return out;
}
const byIdNow = (id) => merged().find((p) => p.id === id);

/* ---------- tabs: #products | #orders | #stats ---------- */
const TABS = ['products', 'orders', 'stats'];
let statsLoaded = false;
function curTab() { const h = (location.hash || '').slice(1); return TABS.includes(h) ? h : 'products'; }
function showTab() {
  const tab = curTab();
  $$('#adm-tabs [data-tab]').forEach((a) => { const on = a.getAttribute('data-tab') === tab; a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  $$('#adm-app [data-pane]').forEach((p) => { p.hidden = p.getAttribute('data-pane') !== tab; });
  $('#adm-who').textContent = user ? (user.email || '') : 'Alex_bes😈 — керування товарами';
  if (!user || !isAdminUser(user)) return;
  if (tab === 'orders') renderOrders();
  if (tab === 'stats' && !statsLoaded) { statsLoaded = true; loadStats(); }
}
window.addEventListener('hashchange', showTab);

/* ---------- gate (login / access) ---------- */
function gate(html) { $('#adm-gate').innerHTML = html; $('#adm-gate').hidden = false; $('#adm-app').hidden = true; }
function loginHTML(err) {
  return '<h1>🔐 Вхід в адмінку</h1><p class="muted">Доступ лише для власника магазину (' + esc(ADMIN_EMAIL) + ').</p>' +
    '<button class="btn btn--g btn--full" type="button" data-g>Увійти через Google</button>' +
    '<div class="acct__or"><span>або email і пароль</span></div>' +
    '<form class="acct__form" id="adm-login" novalidate><label>Email<input name="email" type="email" autocomplete="email"></label>' +
    '<label>Пароль<input name="password" type="password" autocomplete="current-password"></label>' +
    '<button class="btn btn--y btn--full" type="submit">Увійти</button></form>' +
    '<p class="acct__msg" role="alert"' + (err ? '' : ' hidden') + '>' + esc(err || '') + '</p>';
}

async function main() {
  try { fb = await loadFirebase(); } catch (e) { gate('<h1>⚠️ Firebase не завантажився</h1><p class="muted">Перевірте інтернет або вимкніть блокувальник реклами для цього сайту й оновіть сторінку.</p>'); return; }
  const { A, auth } = fb;
  initAdminExtras({ fb, toast, names: () => Object.fromEntries(merged().map((p) => [p.id, p.name || p.id])),
    // 08.10: «Що додають у кошик» — фото й посилання на товар у списку додавань
    products: () => Object.fromEntries(merged().map((p) => [p.id, p])), thumb: (p) => (p ? thumbHTML(p) : '<img src="' + PLACEHOLDER + '" alt="" width="64" height="64">'), lazy: () => lazyPhotos() });
  if (fb.emu) { $('#adm-site').href = './?emu=1'; }
  A.getRedirectResult(auth).catch((e) => gate(loginHTML(authErr(e))));
  A.onAuthStateChanged(auth, onUser);
  document.addEventListener('click', onClick);
  document.addEventListener('submit', onSubmit);
  document.addEventListener('input', onInput);
  document.addEventListener('change', onChange);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#adm-edit').hidden) closeEdit(); });
}

function onUser(u) {
  user = u;
  if (unsub) { unsub(); unsub = null; }
  stopOrders(); statsLoaded = false;
  $('#adm-logout').hidden = !u;
  $('#adm-who').textContent = u ? (u.email || '') : 'Alex_bes😈 — керування товарами';
  if (!u) { gate(loginHTML()); return; }
  if (!isAdminUser(u)) {
    gate('<h1>⛔ Немає доступу</h1><p class="muted">Ви увійшли як <b>' + esc(u.email || '—') + '</b>' + (u.email && u.email.toLowerCase() === ADMIN_EMAIL ? ', але email ще не підтверджено. Підтвердьте email за посиланням у листі й увійдіть знову.' : '. Адмінка доступна лише власнику магазину.') + '</p>' +
      '<button class="btn btn--o btn--full" type="button" data-logout>Вийти</button>');
    return;
  }
  $('#adm-gate').hidden = true; $('#adm-app').hidden = false;
  $('#adm-cat').innerHTML = '<option value="all">Усі категорії</option>' + CATS.map((c) => '<option value="' + c.id + '">' + esc(c.name) + '</option>').join('');
  const { F, db } = fb;
  unsub = F.onSnapshot(F.collection(db, 'products'), (qs) => {
    remote = {}; qs.forEach((d) => { remote[d.id] = d.data(); });
    renderList(); bulkInfo();
  }, (e) => { $('#adm-stats').textContent = 'Помилка читання: ' + authErr(e); });
  renderList();
  startOrders(); // лічильник нових замовлень видно на вкладці з будь-якого розділу
  showTab();
}

/* ---------- list ---------- */
// several badges: 'Новинка · Ексклюзив'
// позначка: основна (Акція / ХІТ / Новинка / свій текст) + окремий прапорець «Ексклюзив».
// Читаємо всі старі формати ('Новинка · Ексклюзив', 'Ексклюзив') і нові коди ('new+excl', 'sale+excl', 'hit+excl'); поле promo у Firestore ≤ 20 символів.
const PROMO_CODE = { new: 'Новинка', 'новинка': 'Новинка', sale: 'Акція', 'акція': 'Акція', hit: 'ХІТ', 'хіт': 'ХІТ', excl: 'Ексклюзив', 'ексклюзив': 'Ексклюзив' };
const PROMO_TO_CODE = { 'Новинка': 'new', 'Акція': 'sale', 'ХІТ': 'hit' };
function parsePromo(t) {
  const main = []; let excl = false;
  String(t || '').split(/\s*(?:·|\+)\s*/).forEach((x) => { if (!x) return; const k = PROMO_CODE[x.toLowerCase()] || x; if (k === 'Ексклюзив') excl = true; else if (!main.includes(k)) main.push(k); });
  return { main: main.join(' · '), excl };
}
function buildPromo(main, excl) {
  if (!excl) return main || '';
  if (!main) return 'Ексклюзив';
  const c = PROMO_TO_CODE[main] || main;
  return (c + '+excl').length <= 20 ? c + '+excl' : null; // null — свій текст задовгий для поєднання з «Ексклюзив»
}
const promoKey = (t) => { const x = parsePromo(t); return x.main + (x.excl ? '|excl' : ''); };
function promoTag(t) { if (!t) return ''; const x = parsePromo(t), l = (x.main ? x.main.split(' · ') : []).concat(x.excl ? ['Ексклюзив'] : []); return l.map(function (y) { return '<span class="tag tag--promo">' + (y === 'ХІТ' ? '⭐ ХІТ' : y === 'Новинка' ? '✅ Новинка' : y === 'Ексклюзив' ? '💎 Ексклюзив' : '🔥 ' + esc(y)) + '</span>'; }).join(''); }
function priceTxt(p) { const o = oldOf(p); return p.price_eur == null ? 'Ціну уточнюйте' : ((p.variants && p.variants.length > 1 ? 'від ' : '') + eur(p.price_eur) + ' (≈ ' + uahOf(p.price_eur) + (o != null ? ', було ' + uahOf(o) : '') + ')' + (p.price_label ? ' · ' + p.price_label : '')); }
function discTag(p) {
  const o = oldOf(p) != null ? p : (p.variants || []).find(oldOf);
  return o ? '<span class="tag tag--disc">\u2212' + pctOf(o.price_old_eur, o.price_eur) + '%</span>' : '';
}
function renderList() {
  const q = $('#adm-q').value.trim().toLowerCase(), cat = $('#adm-cat').value || 'all', flt = $('#adm-flt').value;
  const all = merged();
  const list = all.filter((p) => {
    if (cat !== 'all' && p.category !== cat) return false;
    if (flt === 'changed' && !(p.changed || p.photoChanged)) return false;
    if (flt === 'new' && p.isStatic) return false;
    if (flt === 'hidden' && !p.hidden) return false;
    return !q || (p.name + ' ' + p.code + ' ' + p.id).toLowerCase().includes(q);
  });
  $('#adm-stats').textContent = 'Показано: ' + list.length + ' з ' + all.length + ' · змінено: ' + all.filter((p) => p.changed).length +
    ' · додано: ' + all.filter((p) => !p.isStatic).length + ' · приховано: ' + all.filter((p) => p.hidden).length;
  $('#adm-list').innerHTML = list.map((p) =>
    '<li class="arow' + (p.hidden ? ' is-hidden' : '') + '" data-id="' + esc(p.id) + '">' +
      thumbHTML(p) +
      '<div><div class="arow__n">' + esc(p.name || '(без назви)') + '</div>' +
        '<div class="arow__m">' + esc(catById[p.category] ? catById[p.category].name : p.category) + ' · ' + esc(priceTxt(p)) + ' · ' + esc(p.in_stock) + '</div>' +
        '<div class="arow__b">' + (p.isStatic ? '' : '<span class="tag tag--new">Новий</span>') + (p.changed ? '<span class="tag tag--chg">Змінено</span>' : '') +
          (p.photoChanged || (!p.isStatic && p.gallery.length) ? '<span class="tag">📷 ' + p.gallery.length + '</span>' : '') + (p.videos && p.videos.length ? '<span class="tag">🎬 ' + p.videos.length + '</span>' : '') + (p.hidden ? '<span class="tag tag--hid">Приховано</span>' : '') + discTag(p) + promoTag(p.promo) + '</div></div>' +
      '<div class="arow__a"><button class="btn btn--y" type="button" data-edit="' + esc(p.id) + '">✏️ Редагувати</button>' +
        '<button class="btn btn--o" type="button" data-toggle="' + esc(p.id) + '">' + (p.hidden ? '👁 Показати' : '🙈 Сховати') + '</button></div>' +
    '</li>').join('') || '<li class="muted">Нічого не знайдено.</li>';
  lazyPhotos();
}
function thumbHTML(p) {
  const k = p.gallery[0];
  if (!k) return '<img src="' + PLACEHOLDER + '" alt="" width="64" height="64">';
  if (k === 'static') return '<img src="' + esc(p.photo) + '" alt="" loading="lazy" width="64" height="64">';
  const d = phDoc(p.id, k);
  return '<img src="' + esc(photoCache[d] || PLACEHOLDER) + '"' + (photoCache[d] ? '' : ' data-ph="' + esc(d) + '"') + ' alt="" loading="lazy" width="64" height="64">';
}
let io = null;
function lazyPhotos() {
  const imgs = $$('img[data-ph]');
  if (!('IntersectionObserver' in window)) { imgs.forEach(loadPh); return; }
  if (!io) io = new IntersectionObserver((en) => en.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); loadPh(e.target); } }), { rootMargin: '300px' });
  imgs.forEach((i) => io.observe(i));
}
async function getPhoto(id) {
  if (photoCache[id]) return photoCache[id];
  const s = await fb.F.getDoc(fb.F.doc(fb.db, 'photos', id));
  if (s.exists()) photoCache[id] = s.data().data;
  return photoCache[id] || null;
}
async function loadPh(img) { try { const u = await getPhoto(img.getAttribute('data-ph')); if (u) { img.src = u; img.removeAttribute('data-ph'); } } catch (e) {} }

/* ---------- edit form ---------- */
// варіант: «назва = ціна» або зі знижкою «назва = нова ціна / стара ціна» (усе в €)
const VAR_RE = /^(.*?)\s*[=:–-]\s*([\d\s.,]+?)\s*€?(?:\s*\/\s*([\d\s.,]+?)\s*€?)?$/;
const numOf = (x) => parseFloat(String(x).replace(/\s/g, '').replace(',', '.'));
function varsToText(v) { return (v || []).map((x) => x.label + ' = ' + x.price_eur + (x.price_old_eur != null ? ' / ' + x.price_old_eur : '')).join('\n'); }
function textToVars(t) {
  const out = [];
  t.split('\n').map((l) => l.trim()).filter(Boolean).forEach((l) => {
    const m = l.match(VAR_RE);
    if (!m) throw new Error('Варіант «' + l + '»: потрібен формат «назва = ціна» або «назва = нова ціна / стара ціна».');
    const it = { label: m[1].trim().slice(0, 100), price_eur: numOf(m[2]) };
    if (m[3]) {
      const o = numOf(m[3]);
      if (!isFinite(o) || toUah(o) <= toUah(it.price_eur)) throw new Error('Варіант «' + it.label + '»: стара ціна має бути більшою за нову.');
      it.price_old_eur = o;
    }
    out.push(it);
  });
  return out.length ? out : null;
}
// "Дюза 1.3 = 420" -> "Дюза 1.3 ≈ 21 840 грн" (preview of what the site shows; invalid lines are skipped here, validated on save)
function varsHint(t) {
  const out = [];
  String(t || '').split('\n').map((l) => l.trim()).filter(Boolean).forEach((l) => {
    const m = l.match(VAR_RE);
    if (m) { const n = numOf(m[2]), o = m[3] ? numOf(m[3]) : null; out.push(m[1].trim() + ' ≈ ' + uahOf(n) + (o != null && toUah(o) > toUah(n) ? ' (було ' + uahOf(o) + ', \u2212' + pctOf(o, n) + '%)' : '')); }
  });
  return out.length ? 'На сайті: ' + out.join(' · ') : '';
}
function openEdit(id) {
  const p = id ? byIdNow(id) : null;
  const isNew = !p;
  edit = { id: p ? p.id : null, isNew, isStatic: !!(p && p.isStatic),
    items: (p ? p.gallery : []).map((k) => ({ key: k, src: k === 'static' ? BASE[p.id].photo : photoCache[phDoc(p.id, k)] || null })),
    orig: p ? p.gallery.slice() : [], videos: (p && p.videos ? p.videos.slice() : []) };
  const v = p || { name: '', category: CATS[0] ? CATS[0].id : '', price_eur: null, price_label: '', in_stock: 'В наявності', description: '', promo: '', variants: null, code: '', hidden: false };
  const stockKnown = STOCKS.includes(v.in_stock);
  const b = p && p.isStatic ? baseVals(p.id) : null;
  const pm = parsePromo(v.promo);
  const was = (k, txt) => (b && JSON.stringify(b[k] ?? '') !== JSON.stringify(v[k] ?? '') ? '<span class="ed__base">було: ' + esc(txt != null ? txt : b[k]) + '</span>' : '');
  $('#ed-form').innerHTML =
    '<h2 id="ed-ttl">' + (isNew ? '➕ Новий товар' : '✏️ Редагування') + '</h2>' +
    (p ? '<p class="muted small" style="margin:-6px 0 12px">ID: ' + esc(p.id) + (p.isStatic ? ' · товар з каталогу' : ' · доданий в адмінці') + '</p>' : '') +
    '<div class="ed__grid">' +
      '<label class="full">Назва *<input name="name" maxlength="300" required value="' + esc(v.name) + '">' + was('name') + '</label>' +
      '<label>Категорія<select name="category">' + CATS.map((c) => '<option value="' + c.id + '"' + (c.id === v.category ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') + '</select>' + was('category', b && catById[b.category] ? catById[b.category].name : '') + '</label>' +
      '<label>Ціна, € <span class="hint">(порожньо = «Ціну уточнюйте»)</span><input name="price_eur" type="number" inputmode="decimal" step="0.01" min="0" value="' + (v.price_eur == null ? '' : v.price_eur) + '"><span class="hint" data-uah-hint>' + esc(uahHint(v.price_eur)) + '</span>' + was('price_eur', b && b.price_eur == null ? 'уточнюйте' : null) + '</label>' +
      '<label>Стара ціна, € <span class="hint">(перекреслена на сайті; порожньо = без знижки)</span><input name="price_old_eur" type="number" inputmode="decimal" step="0.0001" min="0" value="' + (v.price_old_eur == null ? '' : v.price_old_eur) + '"><span class="hint" data-old-hint>' + esc(oldHint(v.price_eur, v.price_old_eur)) + '</span>' + was('price_old_eur', b && b.price_old_eur == null ? 'без знижки' : null) + '</label>' +
      '<div class="full ed__disc" role="group" aria-label="Знижка">' +
        '<span class="ed__disc-l">' + IC_TAG + 'Знижка</span>' +
        '<label class="ed__disc-n"><span class="sr-only">Відсоток знижки</span>\u2212<input name="disc_pct" type="number" inputmode="numeric" min="1" max="90" step="1" value="' + (hasDisc(v) ? pctOf((oldOf(v) != null ? v : v.variants.find(oldOf)).price_old_eur, (oldOf(v) != null ? v : v.variants.find(oldOf)).price_eur) : 10) + '">%</label>' +
        '<button class="btn btn--y adm-sm" type="button" data-disc-apply>Застосувати</button>' +
        '<button class="btn btn--o adm-sm" type="button" data-disc-clear>' + IC_UNDO + 'Прибрати знижку</button>' +
        '<span class="hint">Нову ціну рахує від старої (якщо її немає — від поточної), округлює вниз до гривні; так само для кожного варіанта. Збережеться після «Зберегти».</span>' +
      '</div>' +
      '<label>Текст до ціни <span class="hint">(необов’язково, напр. «1 л», «комплект»)</span><input name="price_label" maxlength="120" value="' + esc(v.price_label || '') + '"></label>' +
      '<label>Наявність<select name="in_stock_sel">' + STOCKS.map((s) => '<option' + (s === v.in_stock ? ' selected' : '') + '>' + esc(s) + '</option>').join('') + '<option value="__custom"' + (stockKnown ? '' : ' selected') + '>Інше (свій текст)…</option></select>' + was('in_stock') + '</label>' +
      '<label class="full" data-custom-stock' + (stockKnown ? ' hidden' : '') + '>Свій текст наявності<input name="in_stock_custom" maxlength="120" value="' + esc(stockKnown ? '' : v.in_stock) + '" placeholder="напр. У дорозі · 2 шт"></label>' +
      '<label>Позначка<select name="promo"><option value="">Немає</option>' + [['Акція', '🔥 Акція'], ['ХІТ', '⭐ ХІТ'], ['Новинка', '✅ Новинка']].map((o) => '<option value="' + o[0] + '"' + (pm.main === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') +
        (pm.main && !PROMO_TO_CODE[pm.main] ? '<option value="' + esc(pm.main) + '" selected>' + esc(pm.main) + '</option>' : '') + '</select></label>' +
      '<label class="ed__chk ed__excl"><input name="promo_excl" type="checkbox"' + (pm.excl ? ' checked' : '') + '><span>💎 Ексклюзив <span class="hint">окрема позначка — поєднується з будь-якою</span></span></label>' +
      '<label>Код / артикул <span class="hint">(для пошуку)</span><input name="code" maxlength="120" value="' + esc(v.code || '') + '"></label>' +
      '<label class="full">Опис<textarea name="description" maxlength="6000" rows="5">' + esc(v.description) + '</textarea>' + (was('description', '(змінено)')) + '</label>' +
      '<label class="full">Варіанти <span class="hint">(необов’язково; кожен з нового рядка: «назва = ціна в €», напр. «Дюза 1.3 = 420»; зі знижкою — «назва = нова / стара», напр. «Дюза 1.3 = 378 / 420»)</span><textarea name="variants" rows="3">' + esc(varsToText(v.variants)) + '</textarea><span class="hint" data-uah-vars>' + esc(varsHint(varsToText(v.variants))) + '</span></label>' +
      '<div class="full ed__media" id="ed-media"></div>' +
      '<div class="full ed__vids" id="ed-vids"></div>' +
      '<label class="full ed__chk"><input name="hidden" type="checkbox"' + (v.hidden ? ' checked' : '') + '> Приховати на сайті</label>' +
    '</div>' +
    '<p class="ed__msg" id="ed-msg" role="alert" hidden></p>' +
    '<div class="ed__acts">' +
      '<button class="btn btn--y" type="submit">💾 Зберегти</button>' +
      '<button class="btn btn--o" type="button" data-x>Скасувати</button>' +
      (p && p.isStatic && (p.changed || p.hidden || p.photoChanged) ? '<button class="btn btn--o" type="button" data-reset>↩️ Скинути всі зміни</button>' : '') +
      (p ? '<button class="btn btn--del" type="button" data-del>🗑 ' + (p.isStatic ? 'Видалити з сайту (сховати)' : 'Видалити товар') + '</button>' : '') +
    '</div>';
  renderMedia(); renderVids();
  edit.items.forEach((it) => { if (!it.src && it.key !== 'static') getPhoto(phDoc(p.id, it.key)).then((u) => { if (u && edit && edit.id === p.id) { it.src = u; renderMedia(); } }).catch(() => {}); });
  $('#adm-edit').hidden = false; document.body.style.overflow = 'hidden';
  $('#adm-edit .modal__box').scrollTop = 0;
  if (isNew) { const n = $('#ed-form [name=name]'); if (n) n.focus({ preventScroll: true }); }
}
function renderMedia(note, warn) {
  const box = $('#ed-media'); if (!box || !edit) return;
  const n = edit.items.length;
  box.innerHTML = '<p class="ed__plbl">📷 Фото <span class="hint">(до ' + MAX_PH + '; перше — головне, воно на картці товару)</span></p>' +
    (n ? '<ul class="phg">' + edit.items.map((it, i) =>
      '<li class="phg__it' + (i === 0 ? ' is-main' : '') + '" data-i="' + i + '"><img src="' + esc(it.src || PLACEHOLDER) + '" alt="Фото ' + (i + 1) + '">' +
        '<span class="phg__n">' + (i === 0 ? '★ Головне' : (i + 1) + (it.key === 'static' ? ' · з каталогу' : it.data ? ' · нове' : '')) + '</span>' +
        '<div class="phg__a">' +
          '<button type="button" data-ph-move="-1" aria-label="Перемістити ліворуч"' + (i === 0 ? ' disabled' : '') + '>‹</button>' +
          '<button type="button" data-ph-main aria-label="Зробити головним"' + (i === 0 ? ' disabled' : '') + '>★</button>' +
          '<button type="button" data-ph-move="1" aria-label="Перемістити праворуч"' + (i === n - 1 ? ' disabled' : '') + '>›</button>' +
          '<button type="button" data-ph-del aria-label="Видалити фото" class="phg__del">✕</button>' +
        '</div></li>').join('') + '</ul>' : '<p class="muted small">Фото немає — на сайті буде логотип.</p>') +
    (n < MAX_PH ? '<label class="btn btn--o adm-sm ed__file">📷 Додати фото<input name="photos" type="file" accept="image/*" multiple></label>' : '<p class="muted small">Досягнуто максимум — ' + MAX_PH + ' фото.</p>') +
    (edit.isStatic && !edit.items.some((it) => it.key === 'static') ? ' <button class="btn btn--o adm-sm" type="button" data-ph-static>↩️ Повернути фото з каталогу</button>' : '') +
    '<p class="ed__pinfo' + (warn ? ' warn' : '') + '" id="ed-pinfo">' + esc(note || 'Можна обрати кілька фото одразу. Кожне стискається в браузері: до 800 px, WebP (або JPEG), ≤ 700 КБ.') + '</p>';
}
function vidThumb(v) {
  if (v && v.thumb) return '<img src="' + esc(v.thumb) + '" alt="" loading="lazy">';
  return '<span class="vdl__ico vdl__ico--' + (v ? v.type : 'x') + '">' + (v ? (v.type === 'tiktok' ? '♪' : v.type === 'instagram' ? '◎' : '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5Z"/></svg>') : '?') + '</span>';
}
function renderVids(note, warn) {
  const box = $('#ed-vids'); if (!box || !edit) return;
  const n = edit.videos.length;
  box.innerHTML = '<p class="ed__plbl">🎬 Відео <span class="hint">(до ' + MAX_VID + ' посилань: TikTok, YouTube / Shorts, Instagram Reels)</span></p>' +
    (n ? '<ul class="vdl">' + edit.videos.map((url, i) => {
      const v = MEDIA ? MEDIA.parseVideo(url) : null;
      return '<li class="vdl__it" data-i="' + i + '"><div class="vdl__row">' + vidThumb(v) +
        '<div class="vdl__t"><b>' + esc(v ? v.label : 'Посилання') + '</b><span>' + esc(url) + '</span>' +
          '<em class="' + (v && v.embed ? 'ok' : 'warn') + '">' + (v && v.embed ? '✅ Вбудується на сайті' : '⚠️ Коротке посилання — на сайті буде кнопка «Дивитись відео»') + '</em></div>' +
        '<div class="vdl__a">' + (v && v.embed ? '<button type="button" data-vd-prev aria-label="Переглянути"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5Z"/></svg></button>' : '') +
          '<button type="button" data-vd-move="-1"' + (i === 0 ? ' disabled' : '') + ' aria-label="Вище">▲</button>' +
          '<button type="button" data-vd-del class="phg__del" aria-label="Видалити відео">✕</button></div></div>' +
        '<div class="vdl__pv" hidden></div></li>';
    }).join('') + '</ul>' : '') +
    (n < MAX_VID ? '<div class="vdl__add"><input name="video_url" type="url" inputmode="url" placeholder="Вставте посилання на відео…" autocomplete="off"><button class="btn btn--y adm-sm" type="button" data-vd-add>➕ Додати</button></div>' : '<p class="muted small">Досягнуто максимум — ' + MAX_VID + ' відео.</p>') +
    '<p class="ed__pinfo' + (warn ? ' warn' : '') + '" id="ed-vinfo"' + (note ? '' : ' hidden') + '>' + esc(note || '') + '</p>';
}
function addVideo() {
  const inp = $('#ed-vids input[name=video_url]'); if (!inp) return;
  const url = inp.value.trim(); if (!url) return;
  const v = MEDIA ? MEDIA.parseVideo(url) : null;
  if (!v) { renderVids('⚠️ Не схоже на посилання TikTok, YouTube чи Instagram. Скопіюйте посилання кнопкою «Поділитися» → «Копіювати посилання».', true); $('#ed-vids input[name=video_url]').value = url; return; }
  const norm = v.url.slice(0, 500);
  if (edit.videos.some((x) => { const y = MEDIA.parseVideo(x); return x === norm || (y && v.id && y.type === v.type && y.id === v.id); })) { renderVids('Це відео вже додано.', true); return; }
  edit.videos.push(norm);
  renderVids(v.embed ? '✅ Додано: ' + v.label : '⚠️ Додано коротке посилання ' + v.label + ': вбудувати не вийде, на сайті буде кнопка «Дивитись відео». Краще вставити повне посилання (відкрийте відео в браузері й скопіюйте адресу).', !v.embed);
}
async function addPhotos(files) {
  const free = MAX_PH - edit.items.length;
  const list = Array.from(files).slice(0, Math.max(0, free));
  const skipped = files.length - list.length;
  let done = 0, bad = 0, big = 0;
  for (const f of list) {
    renderMedia('Обробка фото ' + (done + bad + 1) + ' з ' + list.length + '…');
    try {
      const r = await processImage(f);
      if (r.url.length > HARD_MAX) { big++; continue; }
      edit.items.push({ key: 'g' + Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 6), src: r.url, data: r.url, info: r });
      done++;
    } catch (e) { bad++; }
  }
  const parts = ['✅ Додано фото: ' + done + '. Збережеться після «Зберегти».'];
  if (skipped > 0) parts.push('Пропущено ' + skipped + ' — максимум ' + MAX_PH + ' фото.');
  if (big) parts.push(big + ' завеликі навіть після стискання.');
  if (bad) parts.push(bad + ' не вдалося прочитати (спробуйте JPG або PNG).');
  const last = edit.items[edit.items.length - 1];
  if (done && last && last.info) parts.push('Останнє: ' + last.info.w + '×' + last.info.h + ' px, ' + last.info.type + ', ' + last.info.kb + ' КБ.');
  renderMedia(parts.join(' '), !!(skipped || big || bad));
}
function closeEdit() { $$('#adm-edit iframe').forEach((f) => f.remove()); $('#adm-edit').hidden = true; document.body.style.overflow = ''; edit = null; }
function edMsg(t, ok) { const m = $('#ed-msg'); m.textContent = t; m.hidden = !t; m.classList.toggle('ok', !!ok); }

/* ---------- photo: resize to max 800px, WebP (fallback JPEG) ---------- */
function readImage(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Не вдалося прочитати зображення (спробуйте JPG або PNG).')); };
    img.src = url;
  });
}
export async function processImage(file) {
  const img = await readImage(file);
  const w0 = img.naturalWidth, h0 = img.naturalHeight, k = Math.min(1, 800 / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); // no transparency (JPEG fallback)
  ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, 0, 0, w, h);
  let out = null, q = 0.8;
  for (q of [0.8, 0.7, 0.6, 0.5, 0.4]) {
    let u = c.toDataURL('image/webp', q);
    if (!/^data:image\/webp/.test(u)) u = c.toDataURL('image/jpeg', q);
    out = u;
    if (u.length <= MAX_PHOTO) break;
  }
  return { url: out, w, h, q, type: /webp/.test(out.slice(0, 20)) ? 'WebP' : 'JPEG', kb: Math.round(out.length / 1024) };
}

/* ---------- save ---------- */
function readForm(f) {
  const g = (n) => (f.elements[n] ? f.elements[n].value.trim() : '');
  const name = g('name'); if (!name) throw new Error('Вкажіть назву товару.');
  const pr = g('price_eur').replace(',', '.');
  const price = pr === '' ? null : parseFloat(pr);
  if (price != null && (!isFinite(price) || price < 0)) throw new Error('Невірна ціна.');
  const po = g('price_old_eur').replace(',', '.');
  let priceOld = po === '' ? null : parseFloat(po);
  if (priceOld != null && (!isFinite(priceOld) || priceOld < 0)) throw new Error('Невірна стара ціна.');
  if (priceOld != null && (price == null || toUah(priceOld) <= toUah(price))) throw new Error('Стара ціна має бути більшою за нову (поточну). Щоб прибрати знижку — натисніть «Прибрати знижку» або очистіть поле.');
  const sel = g('in_stock_sel'), stock = sel === '__custom' ? g('in_stock_custom') : sel;
  if (!stock) throw new Error('Вкажіть наявність.');
  const variants = textToVars(f.elements.variants.value);
  const promo = buildPromo(g('promo'), !!(f.elements.promo_excl && f.elements.promo_excl.checked));
  if (promo == null) throw new Error('Свій текст позначки задовгий, щоб поєднати його з «Ексклюзив» (до 15 символів).');
  return { name, category: g('category'), price_eur: price, price_old_eur: priceOld, price_label: g('price_label'), in_stock: stock, description: f.elements.description.value.trim(),
    promo, variants, code: g('code'), hidden: f.elements.hidden.checked };
}
function slugId(name) {
  const tr = { а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia' };
  const s = name.toLowerCase().split('').map((ch) => (tr[ch] != null ? tr[ch] : ch)).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'tovar';
  let id; do { id = s + '-' + Math.random().toString(36).slice(2, 6); } while (BASE[id] || remote[id]);
  return id;
}
async function save(f) {
  const { F, db } = fb;
  const v = readForm(f);
  const id = edit.id || slugId(v.name);
  const now = Date.now();
  // 1) upload new photos, 2) write the product doc, 3) delete photos that were removed (so the site never points to a missing photo)
  for (const it of edit.items) {
    if (!it.data) continue;
    await F.setDoc(F.doc(db, 'photos', phDoc(id, it.key)), { data: it.data, updatedAt: now });
    photoCache[phDoc(id, it.key)] = it.data;
  }
  const gallery = edit.items.map((it) => it.key);
  const hasPhoto = gallery.includes('main');
  v.videos = edit.videos.length ? edit.videos.slice(0, MAX_VID) : null;
  const removed = edit.orig.filter((k) => k !== 'static' && !gallery.includes(k));
  const cleanup = async () => { for (const k of removed) { await F.deleteDoc(F.doc(db, 'photos', phDoc(id, k))).catch(() => {}); delete photoCache[phDoc(id, k)]; } };
  let docv;
  if (edit.isStatic) {
    // store only what differs from the static catalog, so future catalog updates still apply to untouched fields
    const b = baseVals(id); docv = {};
    FIELDS.forEach((k) => { const a = v[k] === '' ? null : v[k], z = b[k] === '' ? null : b[k];
      if (k === 'promo' ? promoKey(a) !== promoKey(z) : JSON.stringify(a ?? null) !== JSON.stringify(z ?? null)) docv[k] = v[k]; }); // 'new+excl' = 'Новинка · Ексклюзив' з каталогу — не перекриваємо
    explicitOld(docv, v);
    if (!!v.hidden !== !!BASE[id].hidden) docv.hidden = !!v.hidden; // 08.10: відносно hidden із products.json (false = показати прихований за замовчуванням)
    if (hasPhoto) docv.hasPhoto = true;
    if (JSON.stringify(gallery) !== '["static"]') docv.gallery = gallery;
    if (!Object.keys(docv).length) { await F.deleteDoc(F.doc(db, 'products', id)); await cleanup(); return { id, reset: true }; }
  } else {
    docv = {}; FIELDS.forEach((k) => { docv[k] = v[k]; });
    docv.hidden = v.hidden; docv.hasPhoto = hasPhoto; docv.gallery = gallery; docv.custom = true;
    docv.createdAt = (remote[id] && remote[id].createdAt) || now;
  }
  docv.updatedAt = now;
  await F.setDoc(F.doc(db, 'products', id), docv);
  await cleanup();
  return { id };
}

// якщо пишемо ціну/варіанти — завжди пишемо й price_old_eur (число або null): так сайт знає, що знижкою керує адмінка,
// і не застосовує поверх неї знижку з каталогу (discNorm)
function explicitOld(docv, v) {
  if (('price_eur' in docv || 'variants' in docv) && !('price_old_eur' in docv)) docv.price_old_eur = v.price_old_eur ?? null;
}

/* ---------- знижка на всю категорію (08.10.2026) ---------- */
function bulkTargets() {
  const cat = $('#adm-cat').value || 'all';
  return { cat, list: merged().filter((p) => (cat === 'all' ? false : p.category === cat) && (p.price_eur != null || (p.variants || []).length)) };
}
function discVals(p, pct) { // pct = null -> прибрати знижку
  const one = (o) => {
    const old = oldOf(o) != null ? Number(o.price_old_eur) : (o.price_eur != null ? Number(o.price_eur) : null);
    if (old == null) return { price_eur: o.price_eur ?? null, price_old_eur: null };
    return pct ? { price_eur: discEur(old, pct), price_old_eur: old } : { price_eur: old, price_old_eur: null };
  };
  const top = one(p);
  const variants = p.variants ? p.variants.map((x) => { const r = one(x), y = Object.assign({}, x, { price_eur: r.price_eur }); delete y.price_old_eur; if (r.price_old_eur != null) y.price_old_eur = r.price_old_eur; return y; }) : null;
  return { price_eur: top.price_eur, price_old_eur: top.price_old_eur, variants };
}
async function bulkDiscount(remove) {
  const { F, db } = fb;
  const pct = remove ? null : Math.round(Number($('#bulk-pct').value));
  if (!remove && !(pct >= 1 && pct <= 90)) { toast('Вкажіть знижку від 1 до 90 %'); return; }
  const { cat, list } = bulkTargets();
  if (cat === 'all') { toast('Спершу оберіть категорію у фільтрі зверху'); return; }
  const todo = remove ? list.filter(hasDisc) : list;
  if (!todo.length) { toast(remove ? 'У цій категорії немає товарів зі знижкою' : 'У цій категорії немає товарів з ціною'); return; }
  const cname = catById[cat] ? catById[cat].name : cat;
  if (!confirm(remove ? 'Прибрати знижку в категорії «' + cname + '» (' + todo.length + ' тов.)? Ціни повернуться до старих.' : 'Знижка \u2212' + pct + '% на категорію «' + cname + '» (' + todo.length + ' тов.)? Нова ціна рахується від старої (якщо її немає — від поточної), округлення вниз до гривні.')) return;
  const btns = $$('#adm-bulk button'); btns.forEach((b) => { b.disabled = true; });
  let ok = 0, bad = 0;
  for (const p of todo) {
    try {
      const nv = discVals(p, pct), r = remote[p.id] || {}, now = Date.now();
      if (p.isStatic) {
        const b = baseVals(p.id), docv = {};
        Object.keys(r).forEach((k) => { if (k !== 'updatedAt') docv[k] = r[k]; });
        ['price_eur', 'price_old_eur', 'variants'].forEach((k) => {
          if (JSON.stringify(nv[k] ?? null) !== JSON.stringify(b[k] ?? null)) docv[k] = nv[k]; else delete docv[k];
        });
        explicitOld(docv, nv);
        if (!Object.keys(docv).length) await F.deleteDoc(F.doc(db, 'products', p.id));
        else { docv.updatedAt = now; await F.setDoc(F.doc(db, 'products', p.id), docv); }
      } else {
        await F.setDoc(F.doc(db, 'products', p.id), { price_eur: nv.price_eur, price_old_eur: nv.price_old_eur, variants: nv.variants, updatedAt: now }, { merge: true });
      }
      ok++;
    } catch (e) { bad++; console.warn(p.id, e); }
  }
  btns.forEach((b) => { b.disabled = false; });
  toast((remove ? 'Знижку прибрано: ' : 'Знижку \u2212' + pct + '% застосовано: ') + ok + ' тов.' + (bad ? ' · помилок: ' + bad : ''));
  bulkInfo();
}
function bulkInfo() {
  const el = $('#bulk-info'); if (!el) return;
  const { cat, list } = bulkTargets();
  if (cat === 'all') { el.textContent = 'Оберіть категорію у фільтрі вище — знижка застосується до всіх її товарів з ціною (і прихованих).'; return; }
  const n = list.filter(hasDisc).length;
  el.textContent = (catById[cat] ? catById[cat].name : cat) + ': товарів з ціною — ' + list.length + ', зі знижкою — ' + n + '.';
}
// форма: «−N%» / «Прибрати знижку» (заповнює поля; зберігається кнопкою «Зберегти»)
function oldHint(now, old) {
  const n = parseFloat(String(now == null ? '' : now).replace(',', '.')), o = parseFloat(String(old == null ? '' : old).replace(',', '.'));
  if (!isFinite(o) || String(old).trim() === '') return '';
  if (!isFinite(n) || toUah(o) <= toUah(n)) return 'Стара ціна має бути більшою за нову — інакше її не видно.';
  return 'На сайті: ' + uahOf(n) + ', перекреслено ' + uahOf(o) + ' (\u2212' + pctOf(o, n) + '%)';
}
function formDisc(remove) {
  const f = $('#ed-form'), E = f.elements;
  const pct = Math.round(Number(E.disc_pct.value));
  if (!remove && !(pct >= 1 && pct <= 90)) { edMsg('Вкажіть знижку від 1 до 90 %.'); return; }
  const cur = numOf(E.price_eur.value), old0 = numOf(E.price_old_eur.value);
  const base = isFinite(old0) && E.price_old_eur.value.trim() !== '' ? old0 : (isFinite(cur) && E.price_eur.value.trim() !== '' ? cur : null);
  let lines;
  try { lines = textToVars(E.variants.value) || []; } catch (e) { edMsg(e.message); return; }
  if (base == null && !lines.length) { edMsg('Спершу вкажіть ціну.'); return; }
  if (base != null) {
    if (remove) { E.price_eur.value = base; E.price_old_eur.value = ''; }
    else { E.price_old_eur.value = base; E.price_eur.value = discEur(base, pct); }
  }
  if (lines.length) {
    E.variants.value = lines.map((x) => {
      const o = x.price_old_eur != null ? x.price_old_eur : x.price_eur;
      return remove ? x.label + ' = ' + o : x.label + ' = ' + discEur(o, pct) + ' / ' + o;
    }).join('\n');
  }
  edMsg(remove ? 'Знижку прибрано (ціни повернуто до старих). Натисніть «Зберегти».' : 'Знижку \u2212' + pct + '% застосовано у формі. Натисніть «Зберегти».', true);
  const h = $('[data-uah-hint]'); if (h) h.textContent = uahHint(E.price_eur.value);
  const oh = $('[data-old-hint]'); if (oh) oh.textContent = oldHint(E.price_eur.value, E.price_old_eur.value);
  const vh = $('[data-uah-vars]'); if (vh) vh.textContent = varsHint(E.variants.value);
}

async function delPhotos(id, keys) {
  const { F, db } = fb;
  const all = new Set(['main'].concat(keys || []).filter((k) => k !== 'static'));
  for (const k of all) { await F.deleteDoc(F.doc(db, 'photos', phDoc(id, k))).catch(() => {}); delete photoCache[phDoc(id, k)]; }
}

/* ---------- events ---------- */
async function onClick(e) {
  const t = e.target.closest('button, a, [data-x]'); if (!t) return;
  const { A, auth, F, db } = fb || {};
  if (extrasClick(t)) return;
  if (t.hasAttribute('data-x')) { e.preventDefault(); closeEdit(); return; }
  if (t.id === 'adm-logout' || t.hasAttribute('data-logout')) { await A.signOut(auth); return; }
  if (t.hasAttribute('data-g')) { try { await googleSignIn(fb); } catch (err) { gate(loginHTML(authErr(err))); } return; }
  if (t.id === 'adm-add') { openEdit(null); return; }
  if (t.hasAttribute('data-bulk-apply')) { bulkDiscount(false); return; }
  if (t.hasAttribute('data-bulk-clear')) { bulkDiscount(true); return; }
  if (t.hasAttribute('data-disc-apply')) { formDisc(false); return; }
  if (t.hasAttribute('data-disc-clear')) { formDisc(true); return; }
  if (t.hasAttribute('data-edit')) { openEdit(t.getAttribute('data-edit')); return; }
  if (t.hasAttribute('data-toggle')) {
    const p = byIdNow(t.getAttribute('data-toggle')); if (!p) return;
    t.disabled = true;
    try {
      const ref = F.doc(db, 'products', p.id);
      if (!p.hidden) await F.setDoc(ref, { hidden: true, updatedAt: Date.now() }, { merge: true });
      else if (BASE[p.id] && BASE[p.id].hidden) await F.setDoc(ref, { hidden: false, updatedAt: Date.now() }, { merge: true }); // 08.10: прихований у каталозі (products.json) — показуємо явним hidden:false
      else if (p.isStatic && !p.changed && !p.photoChanged) await F.deleteDoc(ref);
      else await F.setDoc(ref, { hidden: F.deleteField(), updatedAt: Date.now() }, { merge: true });
      toast(p.hidden ? 'Товар знову видно на сайті' : 'Товар приховано');
    } catch (err) { toast(authErr(err)); t.disabled = false; }
    return;
  }
  if (edit && t.closest('#ed-media')) {
    const li = t.closest('[data-i]'), i = li ? +li.getAttribute('data-i') : -1, it = edit.items;
    if (t.hasAttribute('data-ph-move')) { const j = i + +t.getAttribute('data-ph-move'); if (j >= 0 && j < it.length) { [it[i], it[j]] = [it[j], it[i]]; renderMedia(); } return; }
    if (t.hasAttribute('data-ph-main')) { it.unshift(it.splice(i, 1)[0]); renderMedia('★ Головне фото змінено. Збережеться після «Зберегти».'); return; }
    if (t.hasAttribute('data-ph-del')) { if (!confirm('Видалити це фото?')) return; it.splice(i, 1); renderMedia('Фото буде видалено після «Зберегти».'); return; }
    if (t.hasAttribute('data-ph-static')) { if (it.length >= MAX_PH) return; it.unshift({ key: 'static', src: BASE[edit.id].photo }); renderMedia(); return; }
  }
  if (edit && t.closest('#ed-vids')) {
    const li = t.closest('[data-i]'), i = li ? +li.getAttribute('data-i') : -1;
    if (t.hasAttribute('data-vd-add')) { addVideo(); return; }
    if (t.hasAttribute('data-vd-del')) { if (!confirm('Видалити це відео?')) return; edit.videos.splice(i, 1); renderVids('Відео буде видалено після «Зберегти».'); return; }
    if (t.hasAttribute('data-vd-move')) { if (i > 0) { const v = edit.videos; [v[i - 1], v[i]] = [v[i], v[i - 1]]; renderVids(); } return; }
    if (t.hasAttribute('data-vd-prev')) {
      const v = MEDIA.parseVideo(edit.videos[i]), pv = $('.vdl__pv', li);
      if (!pv.hidden) { pv.innerHTML = ''; pv.hidden = true; return; }
      pv.innerHTML = '<div class="vframe' + (v.vertical ? ' vframe--v' : '') + '"><iframe src="' + esc(v.embed) + '" title="' + esc(v.label) + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>';
      pv.hidden = false; return;
    }
  }
  if (t.hasAttribute('data-reset')) {
    if (!confirm('Скинути всі зміни цього товару й повернути дані з каталогу?')) return;
    try { await F.deleteDoc(F.doc(db, 'products', edit.id)); await delPhotos(edit.id, edit.orig); toast('Зміни скинуто'); closeEdit(); } catch (err) { edMsg(authErr(err)); }
    return;
  }
  if (t.hasAttribute('data-del')) {
    const p = byIdNow(edit.id); if (!p) return;
    if (p.isStatic) {
      if (!confirm('Прибрати «' + p.name + '» з сайту? Товар буде приховано (можна повернути кнопкою «Показати»).')) return;
      try { await F.setDoc(F.doc(db, 'products', p.id), { hidden: true, updatedAt: Date.now() }, { merge: true }); toast('Товар приховано'); closeEdit(); } catch (err) { edMsg(authErr(err)); }
    } else {
      if (!confirm('Видалити «' + p.name + '» назавжди? Цю дію не можна скасувати.')) return;
      try { await F.deleteDoc(F.doc(db, 'products', p.id)); await delPhotos(p.id, edit.orig); toast('Товар видалено'); closeEdit(); } catch (err) { edMsg(authErr(err)); }
    }
  }
}
async function onSubmit(e) {
  const f = e.target;
  if (f.id === 'adm-login') {
    e.preventDefault();
    try { await fb.A.signInWithEmailAndPassword(fb.auth, f.elements.email.value.trim(), f.elements.password.value); }
    catch (err) { const m = $('#adm-gate .acct__msg'); m.textContent = authErr(err); m.hidden = false; }
    return;
  }
  if (f.id === 'ed-form') {
    e.preventDefault();
    if (!edit) return;
    const btns = $$('button', f); btns.forEach((b) => { b.disabled = true; }); edMsg('Збереження…', true);
    try { const r = await save(f); toast(r.reset ? 'Збережено — товар такий самий, як у каталозі' : (edit.isNew ? 'Товар додано ✅' : 'Збережено ✅')); closeEdit(); }
    catch (err) { edMsg(err && err.code ? authErr(err) : (err.message || String(err))); btns.forEach((b) => { b.disabled = false; }); }
  }
}
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target && e.target.name === 'video_url') { e.preventDefault(); addVideo(); } });
function onInput(e) {
  const t = e.target;
  if (extrasInput(t)) return;
  if (t.id === 'adm-q') { renderList(); return; }
  if (t.name === 'price_eur' || t.name === 'price_old_eur') {
    const f = $('#ed-form'); const h = $('[data-uah-hint]'); if (h && t.name === 'price_eur') h.textContent = uahHint(t.value);
    const oh = $('[data-old-hint]'); if (oh && f) oh.textContent = oldHint(f.elements.price_eur.value, f.elements.price_old_eur.value); return;
  }
  if (t.name === 'variants') { const h = $('[data-uah-vars]'); if (h) h.textContent = varsHint(t.value); }
}
async function onChange(e) {
  const t = e.target;
  if (extrasChange(t)) return;
  if (t.id === 'adm-cat' || t.id === 'adm-flt') { renderList(); bulkInfo(); return; }
  if (t.name === 'in_stock_sel') { $('[data-custom-stock]').hidden = t.value !== '__custom'; return; }
  if (t.name === 'photos' && t.files && t.files.length && edit) { const files = Array.from(t.files); t.value = ''; await addPhotos(files); }
}

main();
