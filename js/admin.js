/* Alex_bes😈 — адмінка товарів. Доступ: лише besspikk@gmail.com (перевірка в UI + правила Firestore). */
import { loadFirebase, isAdminUser, authErr, googleSignIn, esc, ADMIN_EMAIL } from './fb-common.js?v=1';

const DATA = window.ALEXBES_DATA || { categories: [], products: [] };
const CATS = DATA.categories;
const catById = Object.fromEntries(CATS.map((c) => [c.id, c]));
const BASE = Object.fromEntries(DATA.products.map((p) => [p.id, p]));
// Same as PROMO in js/app.js (static badges); Firestore field `promo` overrides it.
const PROMO = { 'ntools-5000b-upgrades': 'Новинка', 'ntools-te20': 'Новинка', 'sata-jet-x-pro': 'Акція', 'antistatic-easy-paint': 'ХІТ' };
const STOCKS = ['В наявності', 'Немає в наявності', 'Наявність уточнюйте', 'Під замовлення', 'У дорозі'];
DATA.products.forEach((p) => { if (p.in_stock && !STOCKS.includes(p.in_stock)) STOCKS.push(p.in_stock); });
const PLACEHOLDER = 'img/logo.webp?v=3';
const FIELDS = ['name', 'category', 'price_eur', 'price_label', 'in_stock', 'description', 'promo', 'variants', 'code', 'videos'];
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
let tt; function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => { t.hidden = true; }, 2800); }

let fb, user = null, remote = {}, photoCache = {}, unsub = null, edit = null;

/* ---------- data ---------- */
function baseVals(id) {
  const b = BASE[id]; if (!b) return null;
  return { name: b.name, category: b.category, price_eur: b.price_eur ?? null, price_label: b.price_label || '', in_stock: b.in_stock || '',
    description: b.description || '', promo: PROMO[id] || '', variants: b.variants || null, code: b.code || '', videos: null };
}
function merged() {
  const out = [];
  const add = (id) => {
    const r = remote[id], b = baseVals(id);
    const v = Object.assign({ name: '', category: '', price_eur: null, price_label: '', in_stock: 'Наявність уточнюйте', description: '', promo: '', variants: null, code: '' }, b || {});
    if (r) FIELDS.forEach((k) => { if (r[k] !== undefined) v[k] = r[k]; });
    const gallery = effGallery(id, r);
    out.push(Object.assign(v, { id, isStatic: !!b, changed: !!(b && r && FIELDS.some((k) => r[k] !== undefined)), hidden: !!(r && r.hidden), hasPhoto: !!(r && r.hasPhoto),
      gallery, photoChanged: !!(b && JSON.stringify(gallery) !== '["static"]'),
      photo: b ? BASE[id].photo : PLACEHOLDER, createdAt: (r && r.createdAt) || 0 }));
  };
  DATA.products.forEach((p) => add(p.id));
  Object.keys(remote).filter((id) => !BASE[id]).sort((a, b) => (remote[a].createdAt || 0) - (remote[b].createdAt || 0)).forEach(add);
  return out;
}
const byIdNow = (id) => merged().find((p) => p.id === id);

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
    renderList();
  }, (e) => { $('#adm-stats').textContent = 'Помилка читання: ' + authErr(e); });
  renderList();
}

/* ---------- list ---------- */
function promoTag(t) { return t ? '<span class="tag tag--promo">' + (t === 'ХІТ' ? '⭐ ХІТ' : t === 'Новинка' ? '✅ Новинка' : '🔥 ' + esc(t)) + '</span>' : ''; }
function priceTxt(p) { return p.price_eur == null ? 'Ціну уточнюйте' : ((p.variants && p.variants.length > 1 ? 'від ' : '') + eur(p.price_eur) + ' (≈ ' + uahOf(p.price_eur) + ')' + (p.price_label ? ' · ' + p.price_label : '')); }
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
          (p.photoChanged || (!p.isStatic && p.gallery.length) ? '<span class="tag">📷 ' + p.gallery.length + '</span>' : '') + (p.videos && p.videos.length ? '<span class="tag">🎬 ' + p.videos.length + '</span>' : '') + (p.hidden ? '<span class="tag tag--hid">Приховано</span>' : '') + promoTag(p.promo) + '</div></div>' +
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
function varsToText(v) { return (v || []).map((x) => x.label + ' = ' + x.price_eur).join('\n'); }
function textToVars(t) {
  const out = [];
  t.split('\n').map((l) => l.trim()).filter(Boolean).forEach((l) => {
    const m = l.match(/^(.*?)\s*[=:–-]\s*([\d\s.,]+)\s*€?$/);
    if (!m) throw new Error('Варіант «' + l + '»: потрібен формат «назва = ціна».');
    out.push({ label: m[1].trim().slice(0, 100), price_eur: parseFloat(m[2].replace(/\s/g, '').replace(',', '.')) });
  });
  return out.length ? out : null;
}
// "Дюза 1.3 = 420" -> "Дюза 1.3 ≈ 21 840 грн" (preview of what the site shows; invalid lines are skipped here, validated on save)
function varsHint(t) {
  const out = [];
  String(t || '').split('\n').map((l) => l.trim()).filter(Boolean).forEach((l) => {
    const m = l.match(/^(.*?)\s*[=:–-]\s*([\d\s.,]+)\s*€?$/);
    if (m) out.push(m[1].trim() + ' ≈ ' + uahOf(parseFloat(m[2].replace(/\s/g, '').replace(',', '.'))));
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
  const was = (k, txt) => (b && JSON.stringify(b[k] ?? '') !== JSON.stringify(v[k] ?? '') ? '<span class="ed__base">було: ' + esc(txt != null ? txt : b[k]) + '</span>' : '');
  $('#ed-form').innerHTML =
    '<h2 id="ed-ttl">' + (isNew ? '➕ Новий товар' : '✏️ Редагування') + '</h2>' +
    (p ? '<p class="muted small" style="margin:-6px 0 12px">ID: ' + esc(p.id) + (p.isStatic ? ' · товар з каталогу' : ' · доданий в адмінці') + '</p>' : '') +
    '<div class="ed__grid">' +
      '<label class="full">Назва *<input name="name" maxlength="300" required value="' + esc(v.name) + '">' + was('name') + '</label>' +
      '<label>Категорія<select name="category">' + CATS.map((c) => '<option value="' + c.id + '"' + (c.id === v.category ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') + '</select>' + was('category', b && catById[b.category] ? catById[b.category].name : '') + '</label>' +
      '<label>Ціна, € <span class="hint">(порожньо = «Ціну уточнюйте»)</span><input name="price_eur" type="number" inputmode="decimal" step="0.01" min="0" value="' + (v.price_eur == null ? '' : v.price_eur) + '"><span class="hint" data-uah-hint>' + esc(uahHint(v.price_eur)) + '</span>' + was('price_eur', b && b.price_eur == null ? 'уточнюйте' : null) + '</label>' +
      '<label>Текст до ціни <span class="hint">(необов’язково, напр. «1 л», «комплект»)</span><input name="price_label" maxlength="120" value="' + esc(v.price_label || '') + '"></label>' +
      '<label>Наявність<select name="in_stock_sel">' + STOCKS.map((s) => '<option' + (s === v.in_stock ? ' selected' : '') + '>' + esc(s) + '</option>').join('') + '<option value="__custom"' + (stockKnown ? '' : ' selected') + '>Інше (свій текст)…</option></select>' + was('in_stock') + '</label>' +
      '<label class="full" data-custom-stock' + (stockKnown ? ' hidden' : '') + '>Свій текст наявності<input name="in_stock_custom" maxlength="120" value="' + esc(stockKnown ? '' : v.in_stock) + '" placeholder="напр. У дорозі · 2 шт"></label>' +
      '<label>Позначка<select name="promo"><option value="">Немає</option><option value="Акція"' + (v.promo === 'Акція' ? ' selected' : '') + '>🔥 Акція</option><option value="ХІТ"' + (v.promo === 'ХІТ' ? ' selected' : '') + '>⭐ ХІТ</option><option value="Новинка"' + (v.promo === 'Новинка' ? ' selected' : '') + '>✅ Новинка</option></select></label>' +
      '<label>Код / артикул <span class="hint">(для пошуку)</span><input name="code" maxlength="120" value="' + esc(v.code || '') + '"></label>' +
      '<label class="full">Опис<textarea name="description" maxlength="6000" rows="5">' + esc(v.description) + '</textarea>' + (was('description', '(змінено)')) + '</label>' +
      '<label class="full">Варіанти <span class="hint">(необов’язково; кожен з нового рядка: «назва = ціна в €», напр. «Дюза 1.3 = 420»)</span><textarea name="variants" rows="3">' + esc(varsToText(v.variants)) + '</textarea><span class="hint" data-uah-vars>' + esc(varsHint(varsToText(v.variants))) + '</span></label>' +
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
  const sel = g('in_stock_sel'), stock = sel === '__custom' ? g('in_stock_custom') : sel;
  if (!stock) throw new Error('Вкажіть наявність.');
  const variants = textToVars(f.elements.variants.value);
  return { name, category: g('category'), price_eur: price, price_label: g('price_label'), in_stock: stock, description: f.elements.description.value.trim(),
    promo: g('promo'), variants, code: g('code'), hidden: f.elements.hidden.checked };
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
    FIELDS.forEach((k) => { const a = v[k] === '' ? null : v[k], z = b[k] === '' ? null : b[k]; if (JSON.stringify(a ?? null) !== JSON.stringify(z ?? null)) docv[k] = v[k]; });
    if (v.hidden) docv.hidden = true;
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

async function delPhotos(id, keys) {
  const { F, db } = fb;
  const all = new Set(['main'].concat(keys || []).filter((k) => k !== 'static'));
  for (const k of all) { await F.deleteDoc(F.doc(db, 'photos', phDoc(id, k))).catch(() => {}); delete photoCache[phDoc(id, k)]; }
}

/* ---------- events ---------- */
async function onClick(e) {
  const t = e.target.closest('button, a, [data-x]'); if (!t) return;
  const { A, auth, F, db } = fb || {};
  if (t.hasAttribute('data-x')) { e.preventDefault(); closeEdit(); return; }
  if (t.id === 'adm-logout' || t.hasAttribute('data-logout')) { await A.signOut(auth); return; }
  if (t.hasAttribute('data-g')) { try { await googleSignIn(fb); } catch (err) { gate(loginHTML(authErr(err))); } return; }
  if (t.id === 'adm-add') { openEdit(null); return; }
  if (t.hasAttribute('data-edit')) { openEdit(t.getAttribute('data-edit')); return; }
  if (t.hasAttribute('data-toggle')) {
    const p = byIdNow(t.getAttribute('data-toggle')); if (!p) return;
    t.disabled = true;
    try {
      const ref = F.doc(db, 'products', p.id);
      if (!p.hidden) await F.setDoc(ref, { hidden: true, updatedAt: Date.now() }, { merge: true });
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
  if (t.id === 'adm-q') { renderList(); return; }
  if (t.name === 'price_eur') { const h = $('[data-uah-hint]'); if (h) h.textContent = uahHint(t.value); return; }
  if (t.name === 'variants') { const h = $('[data-uah-vars]'); if (h) h.textContent = varsHint(t.value); }
}
async function onChange(e) {
  const t = e.target;
  if (t.id === 'adm-cat' || t.id === 'adm-flt') { renderList(); return; }
  if (t.name === 'in_stock_sel') { $('[data-custom-stock]').hidden = t.value !== '__custom'; return; }
  if (t.name === 'photos' && t.files && t.files.length && edit) { const files = Array.from(t.files); t.value = ''; await addPhotos(files); }
}

main();
