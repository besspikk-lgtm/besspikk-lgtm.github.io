/* Alex_bes😈 — адмінка товарів. Доступ: лише besspikk@gmail.com (перевірка в UI + правила Firestore). */
import { loadFirebase, isAdminUser, authErr, googleSignIn, esc, ADMIN_EMAIL } from './fb-common.js?v=1';
// rv2: admin-orders.js без відгуків
import { initAdminExtras, startOrders, stopOrders, renderOrders, loadStats, loadClients, extrasClick, extrasChange, extrasInput } from './admin-orders.js?v=10';

const DATA = window.ALEXBES_DATA || { categories: [], products: [] };
const CATS = DATA.categories;
const catById = Object.fromEntries(CATS.map((c) => [c.id, c]));
const BASE = Object.fromEntries(DATA.products.map((p) => [p.id, p]));
// Same as PROMO in js/app.js (static badges); Firestore field `promo` overrides it.
const PROMO = { 'meiji-finer-core-liberty-walk': 'Новинка · Ексклюзив', 'meiji-finer-core-black': 'Ексклюзив', 'ntools-5000b-upgrades': 'Новинка', 'ntools-te20': 'Новинка', 'spi-pro-te20-sticker-bomb': 'Новинка', 'ntools-mini-5002': 'Новинка', 'sata-jet-x-pro': 'Акція', 'antistatic-easy-paint': 'ХІТ', 'pal-923-as90': 'ХІТ' };
// lakmerge-20261009: окремі картки лаків 5 л об’єднано з карткою 1 л — їхні старі записи в Firestore не показуємо як окремі товари
const MERGED_GONE = new Set(['pal-923-smart-5l', 'pal-923-as90-5l', 'pal-223-flash-5l', 'pal-223-shine-5l', 'pal-075-0020-5l', 'pal-075-0030-5l', 'pal-077-5l', 'savex-646', 'savex-acrylic', 'savex-metalic', 'savex-gun-cleaner']); // solvmerge-20261009
const STOCKS = ['В наявності', 'В дорозі, наявність уточнюйте', 'Під замовлення', 'Немає в наявності', 'Наявність уточнюйте', 'У дорозі'];
// 16.10: масова зміна наявності (тексти — як у каталозі)
const MASS_STOCKS = [['В дорозі, наявність уточнюйте', 'В дорозі'], ['В наявності', 'В наявності'], ['Під замовлення', 'Під замовлення']];
const SUBS = window.AlexBesSubs || { SUBCATS: {}, typeOf: () => null };
const ED_CATS = () => CATS.filter((c) => c.id !== 'pdr'); // 16.10: розділу «ПДР» на сайті немає — товари в «Товари з Китаю»
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
const SVG = (d, w) => '<svg viewBox="0 0 24 24" width="' + (w || 16) + '" height="' + (w || 16) + '" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
const IC_EYE = SVG('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>');
const IC_LAYERS = SVG('<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>');
const IC_IMG = SVG('<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m21 16-5-5-8 9"/>', 20);
const IC_UPLOAD = SVG('<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4.5 19.5h15"/>');
const IC_UP = SVG('<path d="m6 15 6-6 6 6"/>');
const IC_X = SVG('<path d="M6 6l12 12M18 6 6 18"/>');
const IC_PLUS = SVG('<path d="M12 5v14M5 12h14"/>');
const IC_WAND = SVG('<path d="m4 20 11-11"/><path d="m14 4 1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2Z"/><path d="m19 11 .6 1.4L21 13l-1.4.6L19 15l-.6-1.4L17 13l1.4-.6L19 11Z"/>', 18);
const IC_GRID = SVG('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>');
const IC_EDIT = SVG('<path d="M12 20h9"/><path d="M16.4 3.6a2 2 0 0 1 2.9 2.9L7.4 18.4 3.5 19.5l1.1-3.9L16.4 3.6Z"/>');
const IC_EYEOFF = SVG('<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4"/><path d="M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6"/>');
const IC_CAM = SVG('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', 14);
const IC_VID = SVG('<rect x="2.5" y="6" width="13.5" height="12" rx="2"/><path d="m16 10.5 5.5-3v9l-5.5-3"/>', 14);
const IC_SAVE = SVG('<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>');
const IC_TRASH = SVG('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>');
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
    const o = out[out.length - 1];
    o.typ = typeFor(o);
    o.noPhoto = !o.gallery.length || (o.gallery[0] === 'static' && !!(BASE[id] && BASE[id].photo_is_placeholder));
    o.noPrice = o.price_eur == null && !(o.variants || []).some((x) => x && x.price_eur != null);
  };
  DATA.products.forEach((p) => add(p.id));
  Object.keys(remote).filter((id) => !BASE[id] && !MERGED_GONE.has(id)).sort((a, b) => (remote[a].createdAt || 0) - (remote[b].createdAt || 0)).forEach(add);
  return out;
}
const byIdNow = (id) => merged().find((p) => p.id === id);
// тип на сайті (той самий, що в чипах «Тип» / «Розділ»): js/subs.js — копія SUBCATS з js/app.js
function typeFor(v) {
  const b = BASE[v.id] || {};
  const q = { id: v.id, name: v.name || '', category: v.category === 'pdr' ? 'cn' : v.category, sub: b.sub, type: b.type, brand: b.brand };
  if (v.category === 'pdr' && !q.sub) q.sub = 'pdr';
  try { return SUBS.typeOf(q); } catch (e) { return null; }
}

/* ---------- tabs: #products | #orders | #stats | #clients ---------- */
const TABS = ['products', 'orders', 'stats', 'clients', 'reviews'];
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
  if (tab === 'clients') loadClients();
  if (tab === 'reviews') loadReviews();
}
window.addEventListener('hashchange', showTab);

/* ---------- gate (login / access) ---------- */
function gate(html) { $('#adm-gate').innerHTML = html; $('#adm-gate').hidden = false; $('#adm-app').hidden = true; }
function loginHTML(err) {
  return '<h1>Вхід в адмінку</h1><p class="muted">Доступ лише для власника магазину (' + esc(ADMIN_EMAIL) + ').</p>' +
    '<button class="btn btn--g btn--full" type="button" data-g>Увійти через Google</button>' +
    '<div class="acct__or"><span>або email і пароль</span></div>' +
    '<form class="acct__form" id="adm-login" novalidate><label>Email<input name="email" type="email" autocomplete="email"></label>' +
    '<label>Пароль<input name="password" type="password" autocomplete="current-password"></label>' +
    '<button class="btn btn--y btn--full" type="submit">Увійти</button></form>' +
    '<p class="acct__msg" role="alert"' + (err ? '' : ' hidden') + '>' + esc(err || '') + '</p>';
}

async function main() {
  try { fb = await loadFirebase(); } catch (e) { gate('<h1>Firebase не завантажився</h1><p class="muted">Перевірте інтернет або вимкніть блокувальник реклами для цього сайту й оновіть сторінку.</p>'); return; }
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
    gate('<h1>Немає доступу</h1><p class="muted">Ви увійшли як <b>' + esc(u.email || '—') + '</b>' + (u.email && u.email.toLowerCase() === ADMIN_EMAIL ? ', але email ще не підтверджено. Підтвердьте email за посиланням у листі й увійдіть знову.' : '. Адмінка доступна лише власнику магазину.') + '</p>' +
      '<button class="btn btn--o btn--full" type="button" data-logout>Вийти</button>');
    return;
  }
  $('#adm-gate').hidden = true; $('#adm-app').hidden = false;
  $('#adm-cat').innerHTML = '<option value="all">Усі розділи</option>' + ED_CATS().map((c) => '<option value="' + c.id + '">' + esc(c.name) + '</option>').join('');
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
function promoTag(t) { if (!t) return ''; const x = parsePromo(t), l = (x.main ? x.main.split(' · ') : []).concat(x.excl ? ['Ексклюзив'] : []); return l.map(function (y) { return '<span class="tag tag--promo">' + esc(y) + '</span>'; }).join(''); }
function priceTxt(p) { const o = oldOf(p); return p.price_eur == null ? 'Ціну уточнюйте' : ((p.variants && p.variants.length > 1 ? 'від ' : '') + eur(p.price_eur) + ' (≈ ' + uahOf(p.price_eur) + (o != null ? ', було ' + uahOf(o) : '') + ')' + (p.price_label ? ' · ' + p.price_label : '')); }
function discTag(p) {
  const o = oldOf(p) != null ? p : (p.variants || []).find(oldOf);
  return o ? '<span class="tag tag--disc">\u2212' + pctOf(o.price_old_eur, o.price_eur) + '%</span>' : '';
}
const sel = new Set(); // 16.10: позначені товари для масових дій
let lastList = [];
function fltMatch(p, flt) {
  switch (flt) {
    case 'changed': return p.changed || p.photoChanged;
    case 'new': return !p.isStatic;
    case 'hidden': return p.hidden;
    case 'visible': return !p.hidden;
    case 'noprice': return p.noPrice;
    case 'nophoto': return p.noPhoto;
    case 'way': return /дороз/i.test(p.in_stock || '');
    case 'disc': return hasDisc(p);
    default: return true;
  }
}
function fillTypes(all) {
  const ts = $('#adm-type'); if (!ts) return;
  const cat = $('#adm-cat').value || 'all', cur = ts.value;
  const sc = SUBS.SUBCATS[cat];
  if (!sc) { ts.innerHTML = '<option value="">Тип: усі</option>'; ts.disabled = true; ts.value = ''; return; }
  const inCat = all.filter((p) => p.category === cat || (cat === 'cn' && p.category === 'pdr'));
  ts.innerHTML = '<option value="">' + esc(sc.label) + ': усі</option>' + sc.items.map((it) => {
    const n = inCat.filter((p) => p.typ && p.typ.k === it.k).length;
    return '<option value="' + it.k + '"' + (it.k === cur ? ' selected' : '') + '>' + esc(it.t) + ' (' + n + ')</option>';
  }).join('');
  ts.disabled = false;
  if (cur && !sc.items.some((it) => it.k === cur)) ts.value = '';
}
const normQ = (t) => String(t || '').toLowerCase().replace(/[’'`]/g, '').replace(/\s+/g, ' ');
function renderList() {
  const q = normQ($('#adm-q').value.trim()), cat = $('#adm-cat').value || 'all', flt = $('#adm-flt').value;
  const all = merged();
  fillTypes(all);
  const typ = $('#adm-type') ? $('#adm-type').value : '';
  const words = q ? q.split(' ').filter(Boolean) : [];
  const list = all.filter((p) => {
    if (cat !== 'all' && p.category !== cat && !(cat === 'cn' && p.category === 'pdr')) return false;
    if (typ && !(p.typ && p.typ.k === typ)) return false;
    if (!fltMatch(p, flt)) return false;
    if (!words.length) return true;
    const hay = normQ(p.name + ' ' + p.code + ' ' + p.id + ' ' + (p.typ ? p.typ.t : '') + ' ' + ((BASE[p.id] && BASE[p.id].brand) || ''));
    return words.every((w) => hay.includes(w));
  });
  lastList = list;
  $('#adm-stats').textContent = 'Показано: ' + list.length + ' з ' + all.length + ' · змінено: ' + all.filter((p) => p.changed).length +
    ' · додано: ' + all.filter((p) => !p.isStatic).length + ' · приховано: ' + all.filter((p) => p.hidden).length +
    ' · без ціни: ' + all.filter((p) => p.noPrice).length + ' · без фото: ' + all.filter((p) => p.noPhoto).length;
  $('#adm-list').innerHTML = list.map((p) =>
    '<li class="arow arow--sel' + (p.hidden ? ' is-hidden' : '') + (sel.has(p.id) ? ' is-sel' : '') + '" data-id="' + esc(p.id) + '">' +
      '<label class="arow__chk"><input type="checkbox" data-sel="' + esc(p.id) + '"' + (sel.has(p.id) ? ' checked' : '') + ' aria-label="Позначити «' + esc(p.name || p.id) + '»"></label>' +
      thumbHTML(p) +
      '<div><div class="arow__n">' + esc(p.name || '(без назви)') + '</div>' +
        '<div class="arow__m">' + esc(catById[p.category] ? catById[p.category].name : p.category) + (p.typ ? ' · ' + esc(p.typ.t) : '') + ' · ' + esc(priceTxt(p)) + ' · ' + esc(p.in_stock) + '</div>' +
        '<div class="arow__b">' + (p.isStatic ? '' : '<span class="tag tag--new">Новий</span>') + (p.changed ? '<span class="tag tag--chg">Змінено</span>' : '') +
          (p.photoChanged || (!p.isStatic && p.gallery.length) ? '<span class="tag">' + IC_CAM + p.gallery.length + '</span>' : '') + (p.videos && p.videos.length ? '<span class="tag">' + IC_VID + p.videos.length + '</span>' : '') + (p.hidden ? '<span class="tag tag--hid">Приховано</span>' : '') +
          (p.noPrice ? '<span class="tag tag--warn">Без ціни</span>' : '') + (p.noPhoto ? '<span class="tag tag--warn">Без фото</span>' : '') + (p.variants && p.variants.length > 1 ? '<span class="tag">Варіантів: ' + p.variants.length + '</span>' : '') + discTag(p) + promoTag(p.promo) + '</div></div>' +
      '<div class="arow__a"><button class="btn btn--y" type="button" data-edit="' + esc(p.id) + '">' + IC_EDIT + 'Редагувати</button>' +
        '<button class="btn btn--o" type="button" data-toggle="' + esc(p.id) + '">' + (p.hidden ? IC_EYE + 'Показати' : IC_EYEOFF + 'Сховати') + '</button></div>' +
    '</li>').join('') || '<li class="muted">Нічого не знайдено.</li>';
  massInfo();
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
function openEdit(id, opts) {
  opts = opts || {};
  const p = id ? byIdNow(id) : null;
  const isNew = !p;
  edit = { id: p ? p.id : null, isNew, isStatic: !!(p && p.isStatic),
    items: (p ? p.gallery : []).map((k) => ({ key: k, src: k === 'static' ? BASE[p.id].photo : photoCache[phDoc(p.id, k)] || null })),
    orig: p ? p.gallery.slice() : [], videos: (p && p.videos ? p.videos.slice() : []), vars: varsFrom(p), shot: null };
  const v = p || { name: '', category: opts.shot ? 'cn' : (CATS[0] ? CATS[0].id : ''), price_eur: null, price_label: '', in_stock: opts.shot ? 'В дорозі, наявність уточнюйте' : 'В наявності', description: '', promo: '', variants: null, code: '', hidden: false };
  const stockKnown = STOCKS.includes(v.in_stock);
  const b = p && p.isStatic ? baseVals(p.id) : null;
  const pm = parsePromo(v.promo);
  const was = (k, txt) => (b && JSON.stringify(b[k] ?? '') !== JSON.stringify(v[k] ?? '') ? '<span class="ed__base">було: ' + esc(txt != null ? txt : b[k]) + '</span>' : '');
  $('#ed-form').innerHTML =
    '<h2 id="ed-ttl">' + (isNew ? 'Новий товар' : 'Редагування') + '</h2>' +
    (p ? '<p class="muted small" style="margin:-6px 0 12px">ID: ' + esc(p.id) + (p.isStatic ? ' · товар з каталогу' : ' · доданий в адмінці') + '</p>' : '') +
    '<div class="ed__grid">' +
      '<label class="full">Назва *<input name="name" maxlength="300" required value="' + esc(v.name) + '">' + was('name') + '</label>' +
      '<label>Категорія<select name="category">' + ED_CATS().concat(v.category === 'pdr' ? [catById.pdr] : []).map((c) => '<option value="' + c.id + '"' + (c.id === v.category ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') + '</select>' + was('category', b && catById[b.category] ? catById[b.category].name : '') + '</label>' +
      '<p class="full ed__type" id="ed-type"></p>' +
      '<label>Ціна, грн <span class="hint">(порожньо = «Ціну уточнюйте»)</span><input name="price_uah" type="number" inputmode="numeric" step="1" min="0" value="' + (v.price_eur == null ? '' : toUah(v.price_eur)) + '">' + was('price_eur', b ? (b.price_eur == null ? 'уточнюйте' : uahOf(b.price_eur)) : null) + '</label>' +
      '<label>Стара ціна, грн <span class="hint">(перекреслена; порожньо = без знижки)</span><input name="price_old_uah" type="number" inputmode="numeric" step="1" min="0" value="' + (v.price_old_eur == null ? '' : toUah(v.price_old_eur)) + '"><span class="hint" data-old-hint>' + esc(oldHintU(v.price_eur == null ? '' : toUah(v.price_eur), v.price_old_eur == null ? '' : toUah(v.price_old_eur))) + '</span>' + was('price_old_eur', b ? (b.price_old_eur == null ? 'без знижки' : uahOf(b.price_old_eur)) : null) + '</label>' +
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
      '<label>Позначка<select name="promo"><option value="">Немає</option>' + [['Акція', 'Акція'], ['ХІТ', 'ХІТ'], ['Новинка', 'Новинка']].map((o) => '<option value="' + o[0] + '"' + (pm.main === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') +
        (pm.main && !PROMO_TO_CODE[pm.main] ? '<option value="' + esc(pm.main) + '" selected>' + esc(pm.main) + '</option>' : '') + '</select></label>' +
      '<label class="ed__chk ed__excl"><input name="promo_excl" type="checkbox"' + (pm.excl ? ' checked' : '') + '><span>Ексклюзив <span class="hint">окрема позначка — поєднується з будь-якою</span></span></label>' +
      '<label>Код / артикул <span class="hint">(для пошуку)</span><input name="code" maxlength="120" value="' + esc(v.code || '') + '"></label>' +
      '<label class="full">Опис<textarea name="description" maxlength="6000" rows="5">' + esc(v.description) + '</textarea>' + (was('description', '(змінено)')) + '</label>' +
      '<div class="full ed__vars" id="ed-vars"></div>' +
      '<div class="full ed__shot" id="ed-shot"></div>' +
      '<div class="full ed__media" id="ed-media"></div>' +
      '<div class="full ed__vids" id="ed-vids"></div>' +
      '<label class="full ed__chk"><input name="hidden" type="checkbox"' + (v.hidden ? ' checked' : '') + '> Приховати на сайті</label>' +
    '</div>' +
    '<div class="ed__pv" id="ed-pv"><p class="ed__plbl">' + IC_EYE + 'Попередній перегляд картки <span class="hint">так товар виглядатиме на сайті після «Зберегти»</span></p><div class="ed__pvbox"><iframe id="ed-pvf" title="Попередній перегляд картки" loading="lazy"></iframe></div></div>' +
    '<p class="ed__msg" id="ed-msg" role="alert" hidden></p>' +
    '<div class="ed__acts">' +
      '<button class="btn btn--y" type="submit">' + IC_SAVE + 'Зберегти</button>' +
      '<button class="btn btn--o" type="button" data-x>Скасувати</button>' +
      (p && p.isStatic && (p.changed || p.hidden || p.photoChanged) ? '<button class="btn btn--o" type="button" data-reset>' + IC_UNDO + 'Скинути всі зміни</button>' : '') +
      (p ? '<button class="btn btn--del" type="button" data-del>' + IC_TRASH + (p.isStatic ? 'Видалити з сайту (сховати)' : 'Видалити товар') + '</button>' : '') +
    '</div>';
  renderMedia(); renderVids(); renderVars(); renderShot(!!opts.shot); schedPreview(0);
  edit.items.forEach((it) => { if (!it.src && it.key !== 'static') getPhoto(phDoc(p.id, it.key)).then((u) => { if (u && edit && edit.id === p.id) { it.src = u; renderMedia(); renderVars(); schedPreview(); } }).catch(() => {}); });
  $('#adm-edit').hidden = false; document.body.style.overflow = 'hidden';
  $('#adm-edit .modal__box').scrollTop = 0;
  if (isNew) { const n = $('#ed-form [name=name]'); if (n) n.focus({ preventScroll: true }); }
}
function renderMedia(note, warn) {
  const box = $('#ed-media'); if (!box || !edit) return;
  const n = edit.items.length;
  box.innerHTML = '<p class="ed__plbl">' + IC_CAM + 'Фото <span class="hint">(до ' + MAX_PH + '; перше — головне, воно на картці товару)</span></p>' +
    (n ? '<ul class="phg">' + edit.items.map((it, i) =>
      '<li class="phg__it' + (i === 0 ? ' is-main' : '') + '" data-i="' + i + '"><img src="' + esc(it.src || PLACEHOLDER) + '" alt="Фото ' + (i + 1) + '">' +
        '<span class="phg__n">' + (i === 0 ? '★ Головне' : (i + 1) + (it.key === 'static' ? ' · з каталогу' : it.data ? ' · нове' : '')) + '</span>' +
        '<div class="phg__a">' +
          '<button type="button" data-ph-move="-1" aria-label="Перемістити ліворуч"' + (i === 0 ? ' disabled' : '') + '>‹</button>' +
          '<button type="button" data-ph-main aria-label="Зробити головним"' + (i === 0 ? ' disabled' : '') + '>★</button>' +
          '<button type="button" data-ph-move="1" aria-label="Перемістити праворуч"' + (i === n - 1 ? ' disabled' : '') + '>›</button>' +
          '<button type="button" data-ph-del aria-label="Видалити фото" class="phg__del">✕</button>' +
        '</div></li>').join('') + '</ul>' : '<p class="muted small">Фото немає — на сайті буде логотип.</p>') +
    (n < MAX_PH ? '<label class="btn btn--o adm-sm ed__file">' + IC_CAM + 'Додати фото<input name="photos" type="file" accept="image/*" multiple></label>' : '<p class="muted small">Досягнуто максимум — ' + MAX_PH + ' фото.</p>') +
    (edit.isStatic && !edit.items.some((it) => it.key === 'static') ? ' <button class="btn btn--o adm-sm" type="button" data-ph-static>' + IC_UNDO + 'Повернути фото з каталогу</button>' : '') +
    '<p class="ed__pinfo' + (warn ? ' warn' : '') + '" id="ed-pinfo">' + esc(note || 'Можна обрати кілька фото одразу. Кожне стискається в браузері: до 800 px, WebP (або JPEG), ≤ 700 КБ.') + '</p>';
  if ($('#ed-vars') && $('#ed-vars').childElementCount) { varsSync(); renderVars(); }
  schedPreview();
}
function vidThumb(v) {
  if (v && v.thumb) return '<img src="' + esc(v.thumb) + '" alt="" loading="lazy">';
  return '<span class="vdl__ico vdl__ico--' + (v ? v.type : 'x') + '">' + (v ? (v.type === 'tiktok' ? '♪' : v.type === 'instagram' ? '◎' : '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5Z"/></svg>') : '?') + '</span>';
}
function renderVids(note, warn) {
  const box = $('#ed-vids'); if (!box || !edit) return;
  const n = edit.videos.length;
  box.innerHTML = '<p class="ed__plbl">' + IC_VID + 'Відео <span class="hint">(до ' + MAX_VID + ' посилань: TikTok, YouTube / Shorts, Instagram Reels)</span></p>' +
    (n ? '<ul class="vdl">' + edit.videos.map((url, i) => {
      const v = MEDIA ? MEDIA.parseVideo(url) : null;
      return '<li class="vdl__it" data-i="' + i + '"><div class="vdl__row">' + vidThumb(v) +
        '<div class="vdl__t"><b>' + esc(v ? v.label : 'Посилання') + '</b><span>' + esc(url) + '</span>' +
          '<em class="' + (v && v.embed ? 'ok' : 'warn') + '">' + (v && v.embed ? 'Вбудується на сайті' : 'Коротке посилання — на сайті буде кнопка «Дивитись відео»') + '</em></div>' +
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
  if (!v) { renderVids('Не схоже на посилання TikTok, YouTube чи Instagram. Скопіюйте посилання кнопкою «Поділитися» → «Копіювати посилання».', true); $('#ed-vids input[name=video_url]').value = url; return; }
  const norm = v.url.slice(0, 500);
  if (edit.videos.some((x) => { const y = MEDIA.parseVideo(x); return x === norm || (y && v.id && y.type === v.type && y.id === v.id); })) { renderVids('Це відео вже додано.', true); return; }
  edit.videos.push(norm);
  renderVids(v.embed ? 'Додано: ' + v.label : 'Додано коротке посилання ' + v.label + ': вбудувати не вийде, на сайті буде кнопка «Дивитись відео». Краще вставити повне посилання (відкрийте відео в браузері й скопіюйте адресу).', !v.embed);
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
  const parts = ['Додано фото: ' + done + '. Збережеться після «Зберегти».'];
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

/* ---------- фото зі скріна на фоні (16.10.2026): обрізати скрін, прибрати світлий фон, поставити на прапор бренду -> 800×800 WebP ----------
   Фони — img/bg/<код>.webp (ті самі прапори з гербом, що на картках каталогу). Усе рахується в браузері (canvas), у Firestore
   йде готове фото (photos/{id}…, data URL ≤ 990 КБ — як і звичайні фото з адмінки). */
const SHOT_BGS = [['cn', 'Китай'], ['jp', 'Японія'], ['de', 'Німеччина'], ['it', 'Італія'], ['us', 'США'], ['pl', 'Польща'], ['gb', 'Велика Британія'], ['nl', 'Нідерланди'], ['ua', 'Україна'], ['studio', 'Графітова студія'], ['', 'Без фону (як є)']];
const BRAND_BG = { meiji: 'jp', kovax: 'jp', sata: 'de', teroson: 'de', palinal: 'it', italco: 'it', '3m': 'us', 'turtle wax': 'us', devilbiss: 'us', novol: 'pl', app: 'pl', hardy: 'pl', ncp: 'pl', mercator: 'pl', 'farécla': 'gb', farecla: 'gb', cartec: 'nl', piton: 'ua', barpicar: 'ua', ntools: 'cn', auarita: 'cn', baishangsi: 'cn' };
const bgImgs = {};
function bgImg(k) {
  if (!k) return Promise.resolve(null);
  if (!bgImgs[k]) bgImgs[k] = new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('bg')); i.src = 'img/bg/' + k + '.webp?v=1'; });
  return bgImgs[k];
}
function defaultBg() {
  const f = $('#ed-form'), cat = f && f.elements.category ? f.elements.category.value : '';
  if (cat === 'cn' || cat === 'pdr') return 'cn';
  const b = (edit && edit.id && BASE[edit.id] && BASE[edit.id].brand || '').toLowerCase(), n = (f && f.elements.name ? f.elements.name.value : '').toLowerCase();
  if (BRAND_BG[b]) return BRAND_BG[b];
  for (const k of Object.keys(BRAND_BG)) if (n.includes(k)) return BRAND_BG[k];
  return cat === 'palinal' ? 'it' : 'studio';
}
function renderShot(open) {
  const box = $('#ed-shot'); if (!box || !edit) return;
  const st = edit.shot;
  if (!st) {
    box.innerHTML = '<div class="shot__drop' + (open ? ' is-big' : '') + '"><span class="shot__ic">' + IC_WAND + '</span><div><b>Фото зі скріна на фоні</b><span class="hint">Завантажте скрін товару (Temu, сайт постачальника) — виріжте товар рамкою, і він стане на фон прапора бренду, як інші картки сайту.</span></div>' +
      '<label class="btn btn--y adm-sm">' + IC_UPLOAD + 'Обрати скрін<input type="file" accept="image/*" data-shot-file hidden></label></div>';
    return;
  }
  box.innerHTML = '<p class="ed__plbl">' + IC_WAND + 'Фото зі скріна <span class="hint">Протягніть рамку по скріну, щоб лишити тільки товар</span></p>' +
    '<div class="shot__grid"><div class="shot__src"><canvas id="shot-src" aria-label="Скрін: протягніть рамку"></canvas></div>' +
    '<div class="shot__out"><canvas id="shot-out" width="800" height="800" aria-label="Результат 800×800"></canvas></div></div>' +
    '<div class="shot__ctl">' +
      '<label>Фон<select data-shot="bg">' + SHOT_BGS.map((b) => '<option value="' + b[0] + '"' + (b[0] === st.bg ? ' selected' : '') + '>' + esc(b[1]) + '</option>').join('') + '</select></label>' +
      '<label>Розмір товару<input data-shot="size" type="range" min="45" max="100" step="1" value="' + st.size + '"></label>' +
      '<label class="ed__chk"><input data-shot="cut" type="checkbox"' + (st.cut ? ' checked' : '') + '><span>Прибрати світлий фон скріна</span></label>' +
      '<label>Чутливість<input data-shot="tol" type="range" min="8" max="90" step="1" value="' + st.tol + '"' + (st.cut ? '' : ' disabled') + '></label>' +
    '</div>' +
    '<div class="shot__acts"><button class="btn btn--y adm-sm" type="button" data-shot-add>' + IC_PLUS + 'Додати як фото товару</button>' +
      '<button class="btn btn--o adm-sm" type="button" data-shot-reset>' + IC_UNDO + 'Уся картинка</button>' +
      '<label class="btn btn--o adm-sm">Інший скрін<input type="file" accept="image/*" data-shot-file hidden></label>' +
      '<button class="btn btn--o adm-sm" type="button" data-shot-close>' + IC_X + 'Закрити</button></div>' +
    '<p class="ed__pinfo" id="shot-info"></p>';
  bindShotCanvas(); drawShot();
}
async function shotLoad(file) {
  const img = await readImage(file);
  const k = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  edit.shot = { src: c, crop: [0, 0, c.width, c.height], bg: defaultBg(), size: 84, cut: true, tol: 26, out: null };
  renderShot(true);
}
function bindShotCanvas() {
  const cv = $('#shot-src'), st = edit.shot; if (!cv || !st) return;
  const W = st.src.width, H = st.src.height;
  const bw = Math.min(cv.parentNode.clientWidth || 380, 520), k = bw / W;
  cv.width = Math.round(W * k); cv.height = Math.round(H * k); cv.style.maxHeight = '520px';
  let drag = null;
  const pt = (e) => { const r = cv.getBoundingClientRect(); return [Math.max(0, Math.min(W, (e.clientX - r.left) / r.width * W)), Math.max(0, Math.min(H, (e.clientY - r.top) / r.height * H))]; };
  const paint = () => {
    const g = cv.getContext('2d'); g.drawImage(st.src, 0, 0, cv.width, cv.height);
    const [x0, y0, x1, y1] = st.crop.map((v) => v * cv.width / W);
    g.fillStyle = 'rgba(5,10,25,.55)'; g.beginPath(); g.rect(0, 0, cv.width, cv.height); g.rect(x0, y0, x1 - x0, y1 - y0); g.fill('evenodd');
    g.strokeStyle = '#ffd500'; g.lineWidth = 2; g.setLineDash([6, 4]); g.strokeRect(x0 + 1, y0 + 1, x1 - x0 - 2, y1 - y0 - 2);
  };
  cv.onpointerdown = (e) => { e.preventDefault(); cv.setPointerCapture(e.pointerId); drag = pt(e); };
  cv.onpointermove = (e) => { if (!drag) return; const q = pt(e); st.crop = [Math.min(drag[0], q[0]), Math.min(drag[1], q[1]), Math.max(drag[0], q[0]), Math.max(drag[1], q[1])]; paint(); };
  cv.onpointerup = (e) => { if (!drag) return; drag = null; const c = st.crop; if (c[2] - c[0] < 12 || c[3] - c[1] < 12) st.crop = [0, 0, W, H]; paint(); drawShot(); };
  st.paint = paint; paint();
}
// світлий/однотонний фон скріна -> прозорий: заливка від країв рамки по схожих кольорах
function cutBg(cv, tol) {
  const g = cv.getContext('2d'), w = cv.width, h = cv.height, im = g.getImageData(0, 0, w, h), d = im.data;
  const seen = new Uint8Array(w * h), q = new Int32Array(w * h); let qh = 0, qt = 0;
  const ref = [];
  const push = (i) => { if (!seen[i]) { seen[i] = 1; q[qt++] = i; } };
  for (let x = 0; x < w; x += Math.max(1, (w / 40) | 0)) { ref.push(x); ref.push((h - 1) * w + x); }
  for (let y = 0; y < h; y += Math.max(1, (h / 40) | 0)) { ref.push(y * w); ref.push(y * w + w - 1); }
  const cols = ref.map((i) => [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]]);
  const t2 = tol * tol * 3;
  const near = (i) => { const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2]; for (const c of cols) { const a = r - c[0], e = gg - c[1], f = b - c[2]; if (a * a + e * e + f * f <= t2) return true; } return false; };
  ref.forEach((i) => { if (near(i)) push(i); });
  while (qh < qt) {
    const i = q[qh++]; const x = i % w, y = (i / w) | 0;
    if (x > 0 && !seen[i - 1] && near(i - 1)) push(i - 1);
    if (x < w - 1 && !seen[i + 1] && near(i + 1)) push(i + 1);
    if (y > 0 && !seen[i - w] && near(i - w)) push(i - w);
    if (y < h - 1 && !seen[i + w] && near(i + w)) push(i + w);
  }
  for (let i = 0; i < w * h; i++) if (seen[i]) d[i * 4 + 3] = 0;
  // мʼякий край: напівпрозорі пікселі на межі
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; if (seen[i]) continue; const n = seen[i - 1] + seen[i + 1] + seen[i - w] + seen[i + w]; if (n) d[i * 4 + 3] = Math.round(d[i * 4 + 3] * (1 - n * 0.18)); }
  g.putImageData(im, 0, 0);
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : [x0, y0, x1 + 1, y1 + 1];
}
let shotRaf = 0;
function drawShot() {
  cancelAnimationFrame(shotRaf);
  shotRaf = requestAnimationFrame(async () => {
    const st = edit && edit.shot, out = $('#shot-out'); if (!st || !out) return;
    const [cx0, cy0, cx1, cy1] = st.crop.map(Math.round), cw = Math.max(1, cx1 - cx0), ch = Math.max(1, cy1 - cy0);
    const obj = document.createElement('canvas'); obj.width = cw; obj.height = ch;
    obj.getContext('2d').drawImage(st.src, cx0, cy0, cw, ch, 0, 0, cw, ch);
    let bb = [0, 0, cw, ch];
    if (st.cut && st.bg) { const r = cutBg(obj, st.tol); if (r) bb = r; }
    const S = 800, g = out.getContext('2d');
    g.clearRect(0, 0, S, S);
    let bgi = null; try { bgi = await bgImg(st.bg); } catch (e) {}
    if (bgi) g.drawImage(bgi, 0, 0, S, S); else { g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S); }
    const ow = bb[2] - bb[0], oh = bb[3] - bb[1];
    const lim = S * st.size / 100 * (st.bg ? 0.92 : 1), k = Math.min(lim / ow, lim / oh);
    const dw = ow * k, dh = oh * k, dx = (S - dw) / 2, dy = st.bg ? Math.min((S - dh) / 2 - 8, S - dh - 40) : (S - dh) / 2;
    if (st.bg) {
      if (st.cut) { // контактна тінь під товаром
        g.save(); g.filter = 'blur(14px)'; g.fillStyle = 'rgba(0,0,0,.45)'; g.beginPath(); g.ellipse(S / 2, dy + dh + 4, dw * 0.42, 12, 0, 0, Math.PI * 2); g.fill(); g.restore();
        g.save(); g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 26; g.drawImage(obj, bb[0], bb[1], ow, oh, dx, dy, dw, dh); g.restore();
      } else { // скрін як фото в рамці з тінню
        g.save(); g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 30; g.shadowOffsetY = 10;
        const r = 18; g.beginPath(); g.roundRect(dx, dy, dw, dh, r); g.fillStyle = '#fff'; g.fill(); g.restore();
        g.save(); g.beginPath(); g.roundRect(dx, dy, dw, dh, r); g.clip(); g.drawImage(obj, bb[0], bb[1], ow, oh, dx, dy, dw, dh); g.restore();
      }
    } else g.drawImage(obj, bb[0], bb[1], ow, oh, dx, dy, dw, dh);
    const inf = $('#shot-info'); if (inf) inf.textContent = 'Результат: 800×800 px · фон: ' + (SHOT_BGS.find((b) => b[0] === st.bg) || ['', '—'])[1] + (st.cut && st.bg ? ' · світлий фон скріна прибрано (якщо зʼїло частину товару — зменште чутливість)' : '');
  });
}
function shotEncode() {
  const out = $('#shot-out'); let u = null;
  for (const q of [0.86, 0.78, 0.7, 0.6, 0.5]) { u = out.toDataURL('image/webp', q); if (!/^data:image\/webp/.test(u)) u = out.toDataURL('image/jpeg', q); if (u.length <= MAX_PHOTO) break; }
  return u;
}
function shotClick(t) {
  const st = edit.shot;
  if (t.hasAttribute('data-shot-close')) { edit.shot = null; renderShot(false); return; }
  if (t.hasAttribute('data-shot-reset') && st) { st.crop = [0, 0, st.src.width, st.src.height]; st.paint && st.paint(); drawShot(); return; }
  if (t.hasAttribute('data-shot-add') && st) {
    if (edit.items.length >= MAX_PH) { $('#shot-info').textContent = 'Досягнуто максимум ' + MAX_PH + ' фото.'; return; }
    const u = shotEncode(); if (!u || u.length > HARD_MAX) { $('#shot-info').textContent = 'Фото завелике навіть після стискання.'; return; }
    const key = edit.items.some((x) => x.key === 'main') ? 'g' + Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 6) : 'main';
    edit.items.push({ key, src: u, data: u, info: { w: 800, h: 800, type: 'WebP', kb: Math.round(u.length / 1024) } });
    edit.shot = null; renderShot(false);
    renderMedia('Фото зі скріна додано (' + Math.round(u.length / 1024) + ' КБ). Збережеться після «Зберегти».'); renderVars(); schedPreview();
  }
}
async function shotChange(t) {
  if (t.hasAttribute('data-shot-file') && t.files && t.files[0]) { try { await shotLoad(t.files[0]); } catch (e) { toast('Не вдалося прочитати скрін (спробуйте PNG або JPG)'); } return; }
  const st = edit.shot, k = t.getAttribute('data-shot'); if (!st || !k) return;
  if (k === 'bg') st.bg = t.value; else if (k === 'cut') { st.cut = t.checked; const tl = $('[data-shot=tol]'); if (tl) tl.disabled = !t.checked; } else st[k] = +t.value;
  drawShot();
}

/* ---------- попередній перегляд картки (16.10.2026): та сама розмітка й стилі, що на сайті (css/style.css + css/ux.css) ---------- */
let pvT = 0;
function schedPreview(ms) { clearTimeout(pvT); pvT = setTimeout(renderPreview, ms == null ? 180 : ms); }
const PV_UAH = (e) => String(toUah(e)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') + '\u00a0грн';
function previewProduct() {
  const f = $('#ed-form'); if (!f || !edit) return null;
  const E = f.elements, g = (n) => (E[n] ? String(E[n].value).trim() : '');
  const cur = edit.id ? byIdNow(edit.id) : null;
  const pe = uahToEur(g('price_uah'), cur ? cur.price_eur : null), po = uahToEur(g('price_old_uah'), cur ? cur.price_old_eur : null);
  let vars = null; try { vars = varsOut(); } catch (e) { vars = null; }
  const sel = g('in_stock_sel'), stock = sel === '__custom' ? g('in_stock_custom') : sel;
  const p = { id: edit.id || 'new', name: g('name') || 'Назва товару', category: g('category'), price_eur: pe === undefined ? null : pe, price_old_eur: po === undefined ? null : po,
    in_stock: stock || '', variants: vars, promo: buildPromo(g('promo'), !!(E.promo_excl && E.promo_excl.checked)) || '', price_label: g('price_label') };
  if (p.variants && p.price_eur == null) p.price_eur = Math.min(...p.variants.map((x) => x.price_eur));
  p.typ = typeFor(p);
  return p;
}
function renderPreview() {
  const fr = $('#ed-pvf'), p = previewProduct(); if (!fr || !p) return;
  const tbox = $('#ed-type');
  if (tbox) {
    const sc = SUBS.SUBCATS[p.category === 'pdr' ? 'cn' : p.category];
    tbox.innerHTML = sc ? IC_GRID + '<span>' + esc(sc.label) + ' на сайті: <b>' + esc(p.typ ? p.typ.t : '—') + '</b></span><span class="hint">визначається автоматично за назвою товару' + (p.category === 'cn' ? ' (напр. «регулятор», «шліфмашинка», «брусок», «губка/диск», «вмʼятин/рихтування», «щітка/чистка», «товщиномір»)' : '') + '</span>' : '';
    tbox.hidden = !sc;
  }
  const ph = edit.items[0] ? (edit.items[0].src || PLACEHOLDER) : PLACEHOLDER;
  const old = oldOf(p);
  const from = p.variants && p.variants.length > 1 && new Set(p.variants.map((v) => toUah(v.price_eur))).size > 1 ? '<small>від</small>' : '';
  const pill = p.price_eur == null ? '<span class="pill pill--ask">Ціну уточнюйте</span>' :
    (old != null ? '<span class="pbox"><span class="pill pill--sale">' + from + PV_UAH(p.price_eur) + '</span><span class="pold"><s>' + PV_UAH(old) + '</s><span class="pdisc">\u2212' + pctOf(old, p.price_eur) + '%</span></span></span>' : '<span class="pill">' + from + PV_UAH(p.price_eur) + '</span>');
  const s0 = p.in_stock || '', scls = /немає/i.test(s0) ? ' stock--out' : /наявн/i.test(s0) && !/уточн/i.test(s0) ? '' : /дороз|замовл/i.test(s0) ? ' stock--way' : ' stock--ask';
  const pm = parsePromo(p.promo), tags = (pm.main ? pm.main.split(' · ') : []).concat(pm.excl ? ['Ексклюзив'] : []);
  const promo = tags.map((x, i) => '<span class="promo' + (x === 'ХІТ' ? ' promo--hit' : /новинк/i.test(x) ? ' promo--new' : /ексклюзив/i.test(x) ? ' promo--excl' : '') + (i ? ' promo--n' + (i + 1) : '') + '">' + esc(x) + '</span>').join('');
  const cname = catById[p.category === 'pdr' ? 'cn' : p.category] ? catById[p.category === 'pdr' ? 'cn' : p.category].name : '';
  const card = '<li class="card"><div class="card__in"><div class="card__media"><button class="card__img" type="button"><img src="' + esc(ph) + '" alt="" width="400" height="400">' + promo + '</button>' +
    '<button class="card__add" type="button" aria-hidden="true">+</button></div><div class="card__body"><span class="card__cat">' + esc(cname) + '</span>' +
    '<button class="card__name" type="button">' + esc(p.name) + '</button><div class="card__foot">' + pill + '<span class="stock' + scls + '">' + esc(s0) + '</span></div></div></div></li>';
  const vars = p.variants && p.variants.length ? '<div class="pv-vars"><p>Варіанти в картці товару:</p><div class="vars">' + p.variants.map((v, i) => {
    const src = v.photo ? (v.photo.startsWith('ph:') ? phSrc(v.photo.slice(3)) : v.photo) : '';
    return '<span class="var' + (i === 0 ? ' on' : '') + '">' + (src ? '<img src="' + esc(src) + '" alt="">' : '') + '<b>' + esc(v.label) + '</b><small>' + PV_UAH(v.price_eur) + '</small></span>'; }).join('') + '</div></div>' : '';
  const base = new URL('./', location.href).href;
  const html = '<!doctype html><html lang="uk"><head><meta charset="utf-8"><base href="' + esc(base) + '"><link rel="stylesheet" href="css/style.css?v=62"><link rel="stylesheet" href="css/ux.css?v=20261016t">' +
    '<style>html,body{margin:0;background:var(--bg,#0a1630)}body{padding:14px;display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap}.grid{width:260px;max-width:100%;margin:0;grid-template-columns:1fr!important}.pv-vars{flex:1;min-width:180px;color:var(--muted,#9fb0d0);font:14px/1.4 system-ui,sans-serif}.pv-vars .vars{display:flex;flex-wrap:wrap;gap:8px}.pv-vars .var{display:flex;align-items:center;gap:8px;border:1px solid var(--line,#253a66);border-radius:12px;padding:6px 10px;color:var(--text,#fff)}.pv-vars .var.on{border-color:var(--yellow,#ffd500)}.pv-vars .var img{width:34px;height:34px;border-radius:8px;object-fit:cover}.pv-vars small{color:var(--muted,#9fb0d0);margin-left:4px}</style></head>' +
    '<body><ul class="grid">' + card + '</ul>' + vars + '</body></html>';
  fr.srcdoc = html;
}

/* ---------- відгуки (16.10.2026) ----------
   Новий відгук — документ orders/* з text «Відгук на товар…» і items [{"review":1,pid,pname,rating}] (js/reviews.js); ім’я — name, текст — note.
   Опубліковані — data/reviews.json (дописує бот після «Опублікувати»). Адмін може читати й видаляти orders/* (правила Firestore),
   тому тут: перегляд усіх і «Відхилити» (видалити) нових. Опублікувати / зняти опублікований — лише бот (зміна файлу в репозиторії). */
let rvAll = [], rvPub = {}, rvF = 'pending', rvAt = 0;
const STARS = (n) => '<span class="rv-st" aria-label="' + n + ' з 5">' + [1, 2, 3, 4, 5].map((i) => '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="' + (i <= n ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5Z"/></svg>').join('') + '</span>';
function parseRv(id, o) {
  if (!(typeof o.text === 'string' && o.text.startsWith('Відгук на товар'))) return null;
  let it = null; try { const a = JSON.parse(o.items || '[]'); it = a && a[0]; } catch (e) {}
  if (!it || it.review !== 1) return null;
  const ts = o.createdAt && o.createdAt.toMillis ? o.createdAt.toMillis() : (o.createdAt && o.createdAt.seconds ? o.createdAt.seconds * 1000 : +o.createdAt || 0);
  return { id, pid: it.pid, pname: it.pname || '', rating: it.rating | 0, name: o.name || '', text: o.note || '', ts };
}
async function loadReviews(force) {
  if (!force && rvAt && Date.now() - rvAt < 60000) { renderReviews(); return; }
  const { F, db } = fb;
  $('#rv-stats').textContent = 'Завантаження відгуків…';
  try {
    const [qs, pub] = await Promise.all([
      F.getDocs(F.collection(db, 'orders')),
      fetch('data/reviews.json?ts=' + Date.now(), { cache: 'no-store' }).then((r) => (r.ok ? r.json() : { reviews: [] })).catch(() => ({ reviews: [] }))
    ]);
    rvAll = []; qs.forEach((d) => { const r = parseRv(d.id, d.data()); if (r) rvAll.push(r); });
    rvPub = {}; ((pub && pub.reviews) || []).forEach((r) => { rvPub[r.id] = r; });
    // опубліковані, документів яких уже немає в Firestore
    Object.values(rvPub).forEach((r) => { if (!rvAll.some((x) => x.id === r.id)) rvAll.push({ id: r.id, pid: r.productId, pname: '', rating: r.rating, name: r.name, text: r.text, ts: Date.parse(r.date) || 0 }); });
    rvAll.sort((a, b) => b.ts - a.ts); rvAt = Date.now();
    renderReviews();
  } catch (e) { $('#rv-stats').textContent = 'Не вдалося завантажити відгуки: ' + authErr(e); }
}
function renderReviews() {
  const names = Object.fromEntries(merged().map((p) => [p.id, p.name]));
  const pend = rvAll.filter((r) => !rvPub[r.id]);
  const list = rvF === 'pending' ? pend : rvF === 'pub' ? rvAll.filter((r) => rvPub[r.id]) : rvAll;
  const n = $('#rv-n'); if (n) { n.textContent = pend.length; n.hidden = !pend.length; }
  $('#rv-stats').textContent = 'Нових: ' + pend.length + ' · опублікованих: ' + Object.keys(rvPub).length + ' · показано: ' + list.length;
  const fmt = (t) => (t ? new Date(t).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
  $('#rv-list').innerHTML = list.map((r) => '<li class="rv-it">' +
    '<div class="rv-it__h">' + STARS(r.rating) + '<b>' + esc(r.name || 'Без імені') + '</b><span class="muted small">' + esc(fmt(r.ts)) + '</span>' +
      (rvPub[r.id] ? '<span class="tag tag--new">Опубліковано</span>' : '<span class="tag tag--chg">Новий</span>') + '</div>' +
    '<a class="rv-it__p" href="./#/p/' + esc(r.pid) + '" target="_blank" rel="noopener">' + esc(names[r.pid] || r.pname || r.pid) + '</a>' +
    '<p class="rv-it__t">' + esc(r.text) + '</p>' +
    (rvPub[r.id] ? '<p class="muted small">Щоб прибрати з сайту — кнопка «Видалити» в боті @AlexBes_order_bot.</p>' :
      '<div class="rv-it__a"><span class="muted small">Опублікувати — кнопкою в боті @AlexBes_order_bot</span><button class="btn btn--del adm-sm" type="button" data-rv-del="' + esc(r.id) + '">' + IC_X + 'Відхилити</button></div>') +
    '</li>').join('') || '<li class="muted">' + (rvF === 'pending' ? 'Нових відгуків немає.' : 'Відгуків немає.') + '</li>';
}
async function rejectReview(id, btn) {
  const r = rvAll.find((x) => x.id === id); if (!r || rvPub[id]) return;
  if (!confirm('Відхилити відгук від «' + r.name + '»? Його буде видалено назавжди, на сайті він не зʼявиться.')) return;
  btn.disabled = true;
  try { await fb.F.deleteDoc(fb.F.doc(fb.db, 'orders', id)); rvAll = rvAll.filter((x) => x.id !== id); renderReviews(); toast('Відгук відхилено'); }
  catch (e) { btn.disabled = false; toast(authErr(e)); }
}

/* ---------- save ---------- */
function readForm(f) {
  const g = (n) => (f.elements[n] ? f.elements[n].value.trim() : '');
  const name = g('name'); if (!name) throw new Error('Вкажіть назву товару.');
  const cur = edit && edit.id ? byIdNow(edit.id) : null;
  let price = uahToEur(g('price_uah'), cur ? cur.price_eur : null);
  if (price === undefined) throw new Error('Невірна ціна.');
  const priceOld = uahToEur(g('price_old_uah'), cur ? cur.price_old_eur : null);
  if (priceOld === undefined) throw new Error('Невірна стара ціна.');
  if (priceOld != null && (price == null || toUah(priceOld) <= toUah(price))) throw new Error('Стара ціна має бути більшою за нову (поточну). Щоб прибрати знижку — натисніть «Прибрати знижку» або очистіть поле.');
  const sel = g('in_stock_sel'), stock = sel === '__custom' ? g('in_stock_custom') : sel;
  if (!stock) throw new Error('Вкажіть наявність.');
  const variants = varsOut();
  if (variants && price == null) price = Math.min(...variants.map((x) => x.price_eur)); // ціна на картці = найменша з варіантів (як у каталозі)
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
/* ---------- масові дії (16.10.2026): позначені товари -> ціна / наявність / сховати-показати ---------- */
const eurOfUah = (u) => Math.round(Number(u) / UAH_RATE * 1e4) / 1e4;
function massInfo() {
  const el = $('#mass-n'); if (!el) return;
  const known = new Set(merged().map((p) => p.id));
  [...sel].forEach((id) => { if (!known.has(id)) sel.delete(id); });
  const inView = lastList.filter((p) => sel.has(p.id)).length;
  el.textContent = sel.size ? 'Позначено: ' + sel.size + (inView !== sel.size ? ' (у списку видно ' + inView + ')' : '') : 'Нічого не позначено';
  $('#adm-mass').classList.toggle('on', sel.size > 0);
  $$('#adm-mass [data-mass]').forEach((b) => { b.disabled = !sel.size; });
  const all = $('#mass-all'); if (all) all.textContent = 'Позначити всі знайдені (' + lastList.length + ')';
}
// записати зміну полів товару так само, як форма: для товару з каталогу — лише відмінності від каталогу
async function writeFields(p, patch) {
  const { F, db } = fb, r = remote[p.id] || {}, now = Date.now();
  if (p.isStatic) {
    const b = baseVals(p.id), docv = {};
    Object.keys(r).forEach((k) => { if (k !== 'updatedAt') docv[k] = r[k]; });
    Object.keys(patch).forEach((k) => {
      if (k === 'hidden') { if (!!patch.hidden !== !!BASE[p.id].hidden) docv.hidden = !!patch.hidden; else delete docv.hidden; return; }
      if (JSON.stringify(patch[k] ?? null) !== JSON.stringify(b[k] ?? null)) docv[k] = patch[k]; else delete docv[k];
    });
    if ('price_eur' in patch || 'variants' in patch) explicitOld(docv, Object.assign({}, p, patch));
    if (!Object.keys(docv).length) { await F.deleteDoc(F.doc(db, 'products', p.id)); return; }
    docv.updatedAt = now; await F.setDoc(F.doc(db, 'products', p.id), docv);
  } else {
    await F.setDoc(F.doc(db, 'products', p.id), Object.assign({}, patch, { updatedAt: now }), { merge: true });
  }
}
// нова ціна в грн: абсолютна (лише для товарів без варіантів) або ±% (і варіанти; стара ціна зі знижкою масштабується так само)
function massPrice(p, mode, val) {
  if (mode === 'abs') {
    if (p.variants && p.variants.length > 1) return null;
    return { price_eur: eurOfUah(val), price_old_eur: null, variants: p.variants && p.variants.length === 1 ? [Object.assign({}, p.variants[0], { price_eur: eurOfUah(val), price_old_eur: undefined })].map((x) => { delete x.price_old_eur; return x; }) : (p.variants || null) };
  }
  const k = 1 + val / 100;
  const sc = (e) => (e == null ? e : eurOfUah(Math.round(toUah(e) * k)));
  if (p.price_eur == null && !(p.variants || []).some((x) => x && x.price_eur != null)) return null;
  const out = { price_eur: sc(p.price_eur), price_old_eur: oldOf(p) != null ? sc(p.price_old_eur) : null, variants: p.variants ? p.variants.map((x) => {
    const y = Object.assign({}, x, { price_eur: sc(x.price_eur) }); delete y.price_old_eur; if (oldOf(x) != null) y.price_old_eur = sc(x.price_old_eur); return y; }) : null };
  return out;
}
async function massApply(kind) {
  const ids = [...sel], items = merged().filter((p) => ids.includes(p.id));
  if (!items.length) { toast('Спершу позначте товари'); return; }
  let job, label;
  if (kind === 'price') {
    const mode = $('#mass-pmode').value, val = parseFloat(String($('#mass-pval').value).replace(',', '.'));
    if (!isFinite(val) || (mode === 'abs' ? val <= 0 : (val <= -90 || val > 500 || val === 0))) { toast(mode === 'abs' ? 'Вкажіть ціну в грн' : 'Вкажіть відсоток, напр. 10 або −15'); return; }
    label = mode === 'abs' ? 'Ціна ' + val + ' грн' : 'Ціна ' + (val > 0 ? '+' : '') + val + '%';
    job = (p) => massPrice(p, mode, val);
  } else if (kind === 'stock') {
    const st = $('#mass-stock').value; label = 'Наявність «' + st + '»'; job = () => ({ in_stock: st });
  } else { const h = kind === 'hide'; label = h ? 'Сховати' : 'Показати'; job = () => ({ hidden: h }); }
  const todo = items.map((p) => [p, job(p)]).filter((x) => x[1]);
  const skip = items.length - todo.length;
  if (!todo.length) { toast(kind === 'price' ? 'Немає товарів, яким можна змінити ціну (без ціни або з кількома варіантами)' : 'Нічого змінювати'); return; }
  if (!confirm(label + ': ' + todo.length + ' тов' + (skip ? ' (пропущено ' + skip + ': без ціни або кілька варіантів — їх змінюйте через %)' : '') + '. Продовжити?')) return;
  const btns = $$('#adm-mass button'); btns.forEach((b) => { b.disabled = true; });
  let ok = 0, bad = 0;
  for (const [p, patch] of todo) { try { await writeFields(p, patch); ok++; } catch (e) { bad++; console.warn(p.id, e); } }
  btns.forEach((b) => { b.disabled = false; });
  toast(label + ': ' + ok + ' тов.' + (bad ? ' · помилок: ' + bad : ''));
  massInfo();
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
  const num = (x) => { const n = parseFloat(String(x).replace(',', '.')); return String(x).trim() !== '' && isFinite(n) ? Math.round(n) : null; };
  const cur = num(E.price_uah.value), old0 = num(E.price_old_uah.value);
  const base = old0 != null ? old0 : cur;
  varsSync();
  if (base == null && !edit.vars.length) { edMsg('Спершу вкажіть ціну.'); return; }
  const calc = (o) => Math.floor(o * (100 - pct) / 100);
  if (base != null) {
    if (remove) { E.price_uah.value = base; E.price_old_uah.value = ''; }
    else { E.price_old_uah.value = base; E.price_uah.value = calc(base); }
  }
  edit.vars.forEach((r) => {
    const o = r.olduah !== '' && r.olduah != null ? Math.round(+r.olduah) : (r.uah !== '' && r.uah != null ? Math.round(+r.uah) : null);
    if (o == null) return;
    if (remove) { r.uah = o; r.olduah = ''; } else { r.olduah = o; r.uah = calc(o); }
  });
  renderVars();
  edMsg(remove ? 'Знижку прибрано (ціни повернуто до старих). Натисніть «Зберегти».' : 'Знижку \u2212' + pct + '% застосовано у формі. Натисніть «Зберегти».', true);
  const oh = $('[data-old-hint]'); if (oh) oh.textContent = oldHintU(E.price_uah.value, E.price_old_uah.value);
  schedPreview();
}
// ціни у формі — у гривнях; зберігаються в € (грн / 52, 4 знаки). Якщо гривні не змінилися — лишаємо точне старе значення в €.
function uahToEur(txt, origEur) {
  const t = String(txt == null ? '' : txt).trim().replace(',', '.');
  if (t === '') return null;
  const n = parseFloat(t); if (!isFinite(n) || n < 0) return undefined;
  if (origEur != null && toUah(origEur) === Math.round(n)) return Number(origEur);
  return eurOfUah(Math.round(n));
}
function oldHintU(now, old) {
  const n = parseFloat(String(now == null ? '' : now)), o = parseFloat(String(old == null ? '' : old));
  if (!isFinite(o) || String(old).trim() === '') return '';
  if (!isFinite(n) || o <= n) return 'Стара ціна має бути більшою за нову — інакше її не видно.';
  return 'На сайті: ' + fmtU(n) + ', перекреслено ' + fmtU(o) + ' (\u2212' + Math.round((1 - n / o) * 100) + '%)';
}
const fmtU = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' грн';

/* ---------- редактор варіантів (16.10.2026): назва, ціна грн, стара ціна грн, фото ----------
   Фото варіанта: 'static' — фото з каталогу (img/p/…), ключ фото з адмінки -> 'ph:<ключ>' (js/app.js перемикає галерею на нього),
   'keep:<шлях>' — власне фото варіанта з каталогу (img/v/…), як у лаків 1 л / 5 л. */
function varsFrom(p) {
  return (p && p.variants ? p.variants : []).filter(Boolean).map((x) => {
    const extra = Object.assign({}, x); ['label', 'price_eur', 'price_old_eur', 'photo'].forEach((k) => delete extra[k]);
    let photo = '';
    if (typeof x.photo === 'string' && x.photo) {
      if (/^ph:/.test(x.photo)) photo = x.photo.slice(3);
      else if (BASE[p.id] && String(BASE[p.id].photo).split('?')[0] === x.photo.split('?')[0]) photo = 'static';
      else photo = 'keep:' + x.photo;
    }
    return { label: x.label || '', uah: x.price_eur == null ? '' : toUah(x.price_eur), olduah: x.price_old_eur == null ? '' : toUah(x.price_old_eur),
      origEur: x.price_eur ?? null, origOld: x.price_old_eur ?? null, photo, photo0: photo, photoRaw: x.photo || null, extra };
  });
}
function varsSync() {
  $$('#ed-vars [data-vi]').forEach((li) => {
    const r = edit.vars[+li.getAttribute('data-vi')]; if (!r) return;
    r.label = $('[data-vf=label]', li).value; r.uah = $('[data-vf=uah]', li).value; r.olduah = $('[data-vf=olduah]', li).value; r.photo = $('[data-vf=photo]', li).value;
  });
}
function phSrc(key) {
  if (!key) return '';
  if (key.startsWith('keep:')) return key.slice(5);
  const it = edit.items.find((x) => x.key === key); return it ? it.src || '' : '';
}
function renderVars(note) {
  const box = $('#ed-vars'); if (!box || !edit) return;
  const opts = (cur) => '<option value="">Без окремого фото</option>' + edit.items.map((it, i) => '<option value="' + esc(it.key) + '"' + (it.key === cur ? ' selected' : '') + '>Фото ' + (i + 1) + (i === 0 ? ' (головне)' : '') + '</option>').join('') +
    (cur && cur.startsWith('keep:') ? '<option value="' + esc(cur) + '" selected>Фото варіанта з каталогу</option>' : '') +
    (cur && !cur.startsWith('keep:') && !edit.items.some((it) => it.key === cur) ? '<option value="" selected>(фото видалено)</option>' : '');
  const n = edit.vars.length;
  box.innerHTML = '<p class="ed__plbl">' + IC_LAYERS + 'Варіанти <span class="hint">(необов’язково: обʼєм 1 л / 5 л, набір 24 / 66 шт, колір… Покупець обирає варіант на сайті, ціна й фото змінюються)</span></p>' +
    (n ? '<ul class="vrl">' + edit.vars.map((r, i) => {
      const src = phSrc(r.photo);
      return '<li class="vrl__it" data-vi="' + i + '">' +
        '<span class="vrl__ph">' + (src ? '<img src="' + esc(src) + '" alt="">' : IC_IMG) + '</span>' +
        '<label class="vrl__l"><span>Назва</span><input data-vf="label" maxlength="100" value="' + esc(r.label) + '" placeholder="напр. 1 л або 24 шт"></label>' +
        '<label class="vrl__p"><span>Ціна, грн</span><input data-vf="uah" type="number" inputmode="numeric" min="0" step="1" value="' + esc(r.uah) + '"></label>' +
        '<label class="vrl__p"><span>Стара, грн</span><input data-vf="olduah" type="number" inputmode="numeric" min="0" step="1" value="' + esc(r.olduah) + '" placeholder="—"></label>' +
        '<label class="vrl__f"><span>Фото</span><select data-vf="photo">' + opts(r.photo) + '</select></label>' +
        '<div class="vrl__a"><label class="ibtn" title="Завантажити фото для цього варіанта">' + IC_UPLOAD + '<input type="file" accept="image/*" data-vf-up hidden></label>' +
          '<button type="button" class="ibtn" data-v-move="-1" aria-label="Вище"' + (i === 0 ? ' disabled' : '') + '>' + IC_UP + '</button>' +
          '<button type="button" class="ibtn ibtn--del" data-v-del aria-label="Видалити варіант">' + IC_X + '</button></div>' +
      '</li>'; }).join('') + '</ul>' : '<p class="muted small">Варіантів немає — один товар з однією ціною.</p>') +
    '<button class="btn btn--o adm-sm" type="button" data-v-add>' + IC_PLUS + 'Додати варіант</button>' +
    '<p class="ed__pinfo" id="ed-vinfo2"' + (note ? '' : ' hidden') + '>' + esc(note || '') + '</p>';
}
function varsClick(t) {
  varsSync();
  const li = t.closest('[data-vi]'), i = li ? +li.getAttribute('data-vi') : -1;
  if (t.hasAttribute('data-v-add')) {
    if (edit.vars.length >= 40) { renderVars('Максимум 40 варіантів.'); return; }
    const f = $('#ed-form');
    if (!edit.vars.length && f && f.elements.price_uah.value.trim() !== '') edit.vars.push({ label: '', uah: f.elements.price_uah.value, olduah: f.elements.price_old_uah.value, origEur: null, origOld: null, photo: edit.items[0] ? edit.items[0].key : '', extra: {} });
    edit.vars.push({ label: '', uah: '', olduah: '', origEur: null, origOld: null, photo: '', extra: {} });
    renderVars(edit.vars.length === 2 && !edit.vars[0].label ? 'Перший варіант заповнено поточною ціною — дайте йому назву.' : '');
    const inp = $$('#ed-vars [data-vf=label]').pop(); if (inp) inp.focus();
  } else if (t.hasAttribute('data-v-del')) { edit.vars.splice(i, 1); renderVars(); }
  else if (t.hasAttribute('data-v-move')) { if (i > 0) { const v = edit.vars; [v[i - 1], v[i]] = [v[i], v[i - 1]]; renderVars(); } }
  schedPreview();
}
function varsInput() { varsSync(); }
async function varsChange(t) {
  varsSync();
  if (t.hasAttribute('data-vf-up') && t.files && t.files[0]) {
    const li = t.closest('[data-vi]'), r = edit.vars[+li.getAttribute('data-vi')];
    if (edit.items.length >= MAX_PH) { renderVars('Досягнуто максимум ' + MAX_PH + ' фото.'); return; }
    try {
      const res = await processImage(t.files[0]);
      if (res.url.length > HARD_MAX) throw new Error('big');
      const key = 'g' + Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 6);
      edit.items.push({ key, src: res.url, data: res.url, info: res }); r.photo = key;
      renderMedia('Фото варіанта додано в галерею (Фото ' + edit.items.length + ').'); renderVars();
    } catch (e) { renderVars('Не вдалося обробити фото.'); }
    schedPreview(); return;
  }
  if (t.getAttribute('data-vf') === 'photo') renderVars();
}
function varsOut() {
  if (!edit) return null;
  varsSync();
  const rows = edit.vars.filter((r) => String(r.label).trim() || String(r.uah).trim());
  if (!rows.length) return null;
  const out = rows.map((r, i) => {
    const label = String(r.label).trim().slice(0, 100);
    if (!label) throw new Error('Варіант ' + (i + 1) + ': вкажіть назву.');
    const pe = uahToEur(r.uah, r.origEur);
    if (pe === undefined || pe == null) throw new Error('Варіант «' + label + '»: вкажіть ціну в грн.');
    const it = Object.assign({}, r.extra, { label, price_eur: pe });
    const po = uahToEur(r.olduah, r.origOld);
    if (po === undefined) throw new Error('Варіант «' + label + '»: невірна стара ціна.');
    if (po != null) { if (toUah(po) <= toUah(pe)) throw new Error('Варіант «' + label + '»: стара ціна має бути більшою за нову.'); it.price_old_eur = po; }
    const ph = r.photo;
    if (ph && ph === r.photo0 && r.photoRaw && (ph === 'static' || ph.startsWith('keep:') || edit.items.some((x) => x.key === ph))) it.photo = r.photoRaw;
    else if (ph === 'static' && BASE[edit.id]) it.photo = BASE[edit.id].photo;
    else if (ph && ph.startsWith('keep:')) it.photo = ph.slice(5);
    else if (ph && edit.items.some((x) => x.key === ph)) it.photo = 'ph:' + ph;
    return it;
  });
  return out;
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
  if (t.hasAttribute('data-rv-f')) { rvF = t.getAttribute('data-rv-f'); $$('[data-rv-f]').forEach((b) => b.classList.toggle('on', b === t)); renderReviews(); return; }
  if (t.hasAttribute('data-rv-reload')) { loadReviews(true); return; }
  if (t.hasAttribute('data-rv-del')) { rejectReview(t.getAttribute('data-rv-del'), t); return; }
  if (t.hasAttribute('data-x')) { e.preventDefault(); closeEdit(); return; }
  if (t.id === 'adm-logout' || t.hasAttribute('data-logout')) { await A.signOut(auth); return; }
  if (t.hasAttribute('data-g')) { try { await googleSignIn(fb); } catch (err) { gate(loginHTML(authErr(err))); } return; }
  if (t.id === 'adm-add') { openEdit(null); return; }
  if (t.id === 'adm-add-shot') { openEdit(null, { shot: true }); return; }
  if (t.id === 'mass-all') { lastList.forEach((p) => sel.add(p.id)); renderList(); return; }
  if (t.id === 'mass-none') { sel.clear(); renderList(); return; }
  if (t.hasAttribute('data-mass')) { massApply(t.getAttribute('data-mass')); return; }
  if (edit && t.closest('#ed-vars')) { varsClick(t); return; }
  if (edit && t.closest('#ed-shot')) { shotClick(t); return; }
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
    try { const r = await save(f); toast(r.reset ? 'Збережено — товар такий самий, як у каталозі' : (edit.isNew ? 'Товар додано' : 'Збережено')); closeEdit(); }
    catch (err) { edMsg(err && err.code ? authErr(err) : (err.message || String(err))); btns.forEach((b) => { b.disabled = false; }); }
  }
}
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target && e.target.name === 'video_url') { e.preventDefault(); addVideo(); } });
function onInput(e) {
  const t = e.target;
  if (extrasInput(t)) return;
  if (t.id === 'adm-q') { renderList(); return; }
  if (t.name === 'price_uah' || t.name === 'price_old_uah') {
    const f = $('#ed-form'); const oh = $('[data-old-hint]'); if (oh && f) oh.textContent = oldHintU(f.elements.price_uah.value, f.elements.price_old_uah.value);
    schedPreview(); return;
  }
  if (edit && t.closest && t.closest('#ed-vars')) { varsInput(t); schedPreview(); return; }
  if (edit && t.closest && t.closest('#ed-shot')) { shotChange(t); return; }
  if (edit && t.closest && t.closest('#ed-form')) schedPreview();
}
async function onChange(e) {
  const t = e.target;
  if (extrasChange(t)) return;
  if (t.hasAttribute && t.hasAttribute('data-sel')) { const id = t.getAttribute('data-sel'); if (t.checked) sel.add(id); else sel.delete(id); const li = t.closest('.arow'); if (li) li.classList.toggle('is-sel', t.checked); massInfo(); return; }
  if (t.id === 'adm-cat') { const ts = $('#adm-type'); if (ts) ts.value = ''; renderList(); bulkInfo(); return; }
  if (t.id === 'adm-flt' || t.id === 'adm-type') { renderList(); bulkInfo(); return; }
  if (t.id === 'mass-pmode') { $('#mass-pval').placeholder = t.value === 'abs' ? 'грн' : '%, напр. 10 або -15'; return; }
  if (edit && t.closest && t.closest('#ed-vars')) { varsChange(t); schedPreview(); return; }
  if (edit && t.closest && t.closest('#ed-shot')) { shotChange(t); return; }
  if (edit && t.closest && t.closest('#ed-form')) schedPreview();
  if (t.name === 'in_stock_sel') { $('[data-custom-stock]').hidden = t.value !== '__custom'; return; }
  if (t.name === 'photos' && t.files && t.files.length && edit) { const files = Array.from(t.files); t.value = ''; await addPhotos(files); }
}

main();
