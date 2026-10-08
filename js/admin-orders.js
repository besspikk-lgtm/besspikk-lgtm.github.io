/* Alex_bes😈 — адмінка: «📦 Замовлення» (orders/{id}) і «📊 Статистика» (stats/{YYYY-MM-DD} + cart_events/{id} — що додають у кошик). Підключає js/admin.js. */
import { authErr, esc } from './fb-common.js?v=1';

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const TZ = 'Europe/Kyiv';
export const STATUSES = [
  { id: 'new', label: '🆕 Нове' },
  { id: 'confirmed', label: '✅ Підтверджено' },
  { id: 'shipped', label: '📦 Відправлено' },
  { id: 'paid', label: '💰 Оплачено' },
  { id: 'cancelled', label: '❌ Скасовано' }
];
const ST = Object.fromEntries(STATUSES.map((s) => [s.id, s]));
const stOf = (o) => (ST[o.status] ? o.status : 'new'); // без поля status = нове
const MAX_ORDERS = 500;
const grn = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') + '\u00a0грн';
const dtf = new Intl.DateTimeFormat('uk-UA', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtTs = (ts) => { try { const d = ts && ts.toDate ? ts.toDate() : null; return d ? dtf.format(d) : '—'; } catch (e) { return '—'; } };
// "067 111 22 33" -> "+380671112233" (для tel:); інше — лише цифри і "+"
function telHref(p) {
  let d = String(p || '').replace(/[^\d+]/g, '');
  if (/^0\d{9}$/.test(d)) d = '+38' + d;
  else if (/^380\d{9}$/.test(d)) d = '+' + d;
  return d.replace(/(?!^)\+/g, '');
}
function parseItems(s) {
  try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a.filter((x) => x && typeof x === 'object') : []; } catch (e) { return null; }
}

let ctx = null; // { fb, toast, names(), products(), thumb(p), lazy() }
let orders = [], unsubO = null, flt = 'all', oq = '', loaded = false, oErr = '';

export function initAdminExtras(c) { ctx = c; }

/* ---------- замовлення ---------- */
export function startOrders() {
  stopOrders();
  const { F, db } = ctx.fb;
  loaded = false; oErr = '';
  const q = F.query(F.collection(db, 'orders'), F.orderBy('createdAt', 'desc'), F.limit(MAX_ORDERS));
  unsubO = F.onSnapshot(q, (qs) => {
    orders = qs.docs.map((d) => Object.assign({ id: d.id }, d.data()));
    loaded = true; oErr = '';
    renderOrders();
  }, (e) => { oErr = authErr(e); renderOrders(); });
}
export function stopOrders() { if (unsubO) { unsubO(); unsubO = null; } orders = []; }

// «Купити в один клік» на сайті: маркер на початку text (окремого поля правила Firestore не дозволяють)
const isQuick = (o) => typeof o.text === 'string' && o.text.startsWith('Швидке замовлення');
function orderHay(o) {
  const it = parseItems(o.items) || [];
  return [isQuick(o) ? 'швидке замовлення в один клік' : '', o.name, o.phone, o.city, o.note, o.id].concat(it.map((x) => x.name + ' ' + (x.variant || ''))).join(' ').toLowerCase();
}
function itemsHTML(o) {
  const it = parseItems(o.items);
  if (it === null) return '<p class="muted small">Не вдалося прочитати список товарів.</p>';
  if (!it.length) return '<p class="muted small">Товарів немає.</p>';
  return '<ul class="ocard__items">' + it.map((x) => {
    const q = Math.max(1, parseInt(x.qty, 10) || 1), pr = typeof x.price_uah === 'number' ? x.price_uah : null;
    return '<li><span class="ocard__iname">' + esc(x.name || x.id || '—') + (x.variant ? ' <i>(' + esc(x.variant) + ')</i>' : '') + '</span>' +
      '<span class="ocard__ipr">' + (pr == null ? q + ' шт · ціну уточнити' : q + ' × ' + grn(pr) + (q > 1 ? ' = <b>' + grn(pr * q) + '</b>' : '')) + '</span></li>';
  }).join('') + '</ul>';
}
function totalHTML(o) {
  const it = parseItems(o.items) || [];
  const ask = typeof o.ask === 'number' ? o.ask : it.filter((x) => typeof x.price_uah !== 'number').length;
  const tot = typeof o.total_uah === 'number' ? o.total_uah : null;
  if (tot == null && !ask) return '';
  return '<div class="ocard__tot">Разом: <b>' + (tot != null ? grn(tot) : '—') + '</b>' +
    (ask ? ' <span class="muted small">+ ' + ask + ' ' + (ask === 1 ? 'позиція' : ask < 5 ? 'позиції' : 'позицій') + ' — ціну уточнити</span>' : '') + '</div>';
}
function orderHTML(o) {
  const s = stOf(o);
  return '<li class="ocard ocard--' + s + (isQuick(o) ? ' ocard--quick' : '') + '" data-oid="' + esc(o.id) + '">' +
    '<div class="ocard__h"><span class="ocard__dt">🕒 ' + esc(fmtTs(o.createdAt)) + '</span>' + (isQuick(o) ? '<span class="oquick" title="Оформлено кнопкою «Купити в один клік»">⚡ Швидке замовлення</span>' : '') + '<span class="ost ost--' + s + '">' + ST[s].label + '</span></div>' +
    '<div class="ocard__who">' +
      '<div>👤 <b>' + esc(o.name || '— ім’я не вказано') + '</b></div>' +
      '<div>📞 ' + (o.phone ? '<a href="tel:' + esc(telHref(o.phone)) + '">' + esc(o.phone) + '</a>' : '<span class="muted">телефон не вказано</span>') + '</div>' +
      '<div>📍 ' + (o.city ? esc(o.city) : '<span class="muted">місто / НП не вказано</span>') + '</div>' +
    '</div>' +
    itemsHTML(o) + totalHTML(o) +
    (o.note ? '<div class="ocard__note">💬 ' + esc(o.note) + '</div>' : '') +
    '<div class="ocard__a"><label class="ocard__sel"><span>Статус</span><select data-ost="' + esc(o.id) + '" aria-label="Статус замовлення">' +
      STATUSES.map((x) => '<option value="' + x.id + '"' + (x.id === s ? ' selected' : '') + '>' + x.label + '</option>').join('') + '</select></label>' +
      '<button class="btn btn--del adm-sm" type="button" data-odel="' + esc(o.id) + '">🗑 Видалити</button></div>' +
    '<div class="ocard__m">№ ' + esc(o.id) + (o.updatedAt ? ' · статус змінено ' + esc(fmtTs(o.updatedAt)) : '') + '</div>' +
  '</li>';
}
export function renderOrders() {
  const cnt = { all: orders.length }; STATUSES.forEach((x) => { cnt[x.id] = 0; });
  orders.forEach((o) => { cnt[stOf(o)]++; });
  const b = $('#ord-new'); if (b) { b.textContent = cnt.new; b.hidden = !cnt.new; }
  const fl = $('#ord-flt');
  if (fl) fl.innerHTML = [{ id: 'all', label: 'Усі' }].concat(STATUSES).map((x) =>
    '<button class="chip' + (flt === x.id ? ' on' : '') + '" type="button" data-oflt="' + x.id + '">' + x.label + ' <small>' + cnt[x.id] + '</small></button>').join('');
  const list = $('#ord-list'), info = $('#ord-stats'); if (!list) return;
  if (oErr) { info.textContent = 'Помилка читання замовлень: ' + oErr; list.innerHTML = ''; return; }
  if (!loaded) { info.textContent = 'Завантаження замовлень…'; return; }
  const q = oq.trim().toLowerCase();
  const show = orders.filter((o) => (flt === 'all' || stOf(o) === flt) && (!q || orderHay(o).includes(q)));
  info.textContent = 'Показано: ' + show.length + ' з ' + orders.length + ' · нових: ' + cnt.new + ' · час — київський' +
    (orders.length >= MAX_ORDERS ? ' · завантажено останні ' + MAX_ORDERS : '');
  list.innerHTML = show.map(orderHTML).join('') || '<li class="muted">' + (orders.length ? 'Немає замовлень з таким фільтром.' : 'Замовлень ще немає.') + '</li>';
}
async function setStatus(sel) {
  const id = sel.getAttribute('data-ost'), v = sel.value, o = orders.find((x) => x.id === id);
  if (!o || !ST[v]) return;
  const prev = stOf(o);
  if (prev === v) return;
  const { F, db } = ctx.fb;
  sel.disabled = true;
  try {
    await F.updateDoc(F.doc(db, 'orders', id), { status: v, updatedAt: F.serverTimestamp() });
    ctx.toast('Статус: ' + ST[v].label);
  } catch (e) { sel.value = prev; sel.disabled = false; ctx.toast('Не вдалося змінити статус: ' + authErr(e)); }
}
async function delOrder(btn) {
  const id = btn.getAttribute('data-odel'), o = orders.find((x) => x.id === id); if (!o) return;
  if (!confirm('Видалити замовлення' + (o.name ? ' від «' + o.name + '»' : '') + ' (' + fmtTs(o.createdAt) + ')? Цю дію не можна скасувати.')) return;
  btn.disabled = true;
  try { await ctx.fb.F.deleteDoc(ctx.fb.F.doc(ctx.fb.db, 'orders', id)); ctx.toast('Замовлення видалено'); }
  catch (e) { btn.disabled = false; ctx.toast('Не вдалося видалити: ' + authErr(e)); }
}

/* ---------- статистика ---------- */
const CH = [
  ['o_bot', '🤖 Бот для замовлень (кошик, кнопки сайту)'], ['o_botp', '🤖 «Замовити через бота» з картки товару'],
  ['o_tg', '✈️ Telegram'], ['o_wa', '🟢 WhatsApp'], ['o_viber', '🟣 Viber'], ['o_ig', '📸 Instagram (Direct)'],
  ['o_call', '📞 Дзвінок'], ['o_consult', '💬 «Отримати консультацію»']
];
let stDocs = null, stRange = 7, stErr = '', stBusy = false;
// 08.10: журнал «що додають у кошик» — cart_events (останні 31 день, до CE_LIMIT подій; читає лише адмін); список додавань з фото, фільтр за товаром
let ceDocs = null, ceErr = '';
const CE_LIMIT = 3000;
function kyivDay(d) {
  const o = {}; new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).forEach((x) => { o[x.type] = x.value; });
  return o.year + '-' + o.month + '-' + o.day;
}
function lastDays(n) { // ['YYYY-MM-DD', …] від найстарішого до сьогодні (Київ)
  const t = kyivDay(new Date()), base = Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10)), out = [];
  for (let i = n - 1; i >= 0; i--) out.push(new Date(base - i * 864e5).toISOString().slice(0, 10));
  return out;
}
export async function loadStats() {
  if (stBusy) return;
  stBusy = true; stErr = '';
  const body = $('#st-body'); if (body && !stDocs) body.innerHTML = '<p class="muted">Завантаження статистики…</p>';
  try {
    const { F, db } = ctx.fb, from = lastDays(30)[0];
    const qs = await F.getDocs(F.query(F.collection(db, 'stats'), F.where(F.documentId(), '>=', from)));
    stDocs = {}; qs.forEach((d) => { stDocs[d.id] = d.data(); });
  } catch (e) { stErr = authErr(e); }
  try {
    const { F, db } = ctx.fb, since = F.Timestamp.fromMillis(Date.now() - 31 * 864e5);
    const qe = await F.getDocs(F.query(F.collection(db, 'cart_events'), F.where('ts', '>=', since), F.orderBy('ts', 'desc'), F.limit(CE_LIMIT)));
    ceDocs = qe.docs.map((d) => Object.assign({ id: d.id }, d.data())); ceErr = '';
  } catch (e) { ceDocs = null; ceErr = (e && e.code === 'permission-denied') ? 'perm' : authErr(e); }
  stBusy = false;
  renderStats();
}
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
const nf = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
export function renderStats() {
  const body = $('#st-body'); if (!body) return;
  $$('[data-st-range]').forEach((b) => b.classList.toggle('on', +b.getAttribute('data-st-range') === stRange));
  const cb = $('#st-nostats'); if (cb) { try { cb.checked = localStorage.getItem('alexbes_nostats') === '1'; } catch (e) {} }
  if (stErr) { body.innerHTML = '<p class="ed__msg">Помилка читання статистики: ' + esc(stErr) + '</p>'; return; }
  if (!stDocs) return;
  const days = lastDays(stRange), names = ctx.names();
  const tot = { views: 0, cart: 0, opens: 0, clicks: 0 }, prod = {}, ch = {};
  const per = days.map((d) => {
    const x = stDocs[d] || {};
    tot.views += num(x.views); tot.cart += num(x.cart);
    Object.keys(x).forEach((k) => {
      if (k.startsWith('p_')) { prod[k.slice(2)] = (prod[k.slice(2)] || 0) + num(x[k]); tot.opens += num(x[k]); }
      else if (k.startsWith('o_')) { ch[k] = (ch[k] || 0) + num(x[k]); tot.clicks += num(x[k]); }
    });
    return { d, v: num(x.views), c: num(x.cart) };
  });
  const maxV = Math.max(1, ...per.map((p) => p.v));
  const wd = new Intl.DateTimeFormat('uk-UA', { weekday: 'short', timeZone: 'UTC' });
  const bars = '<div class="stc stc--' + stRange + '" role="img" aria-label="Візити по днях">' + per.map((p, i) => {
    const dt = new Date(p.d + 'T00:00:00Z'), lbl = stRange <= 7 ? wd.format(dt) + '<br>' + p.d.slice(8) + '.' + p.d.slice(5, 7) : (i % 5 === 4 || i === per.length - 1 ? p.d.slice(8) + '.' + p.d.slice(5, 7) : '');
    return '<div class="stc__c" title="' + p.d.slice(8) + '.' + p.d.slice(5, 7) + ': ' + p.v + ' візит.">' +
      '<span class="stc__v">' + (stRange <= 7 || p.v === maxV ? (p.v || '') : '') + '</span>' +
      '<span class="stc__b" style="height:' + (p.v ? Math.max(3, Math.round(p.v / maxV * 100)) : 0) + '%"></span>' +
      '<span class="stc__l">' + lbl + '</span></div>';
  }).join('') + '</div>';
  const top = Object.keys(prod).sort((a, b) => prod[b] - prod[a] || a.localeCompare(b)).slice(0, 10);
  const maxP = Math.max(1, ...top.map((k) => prod[k]));
  const maxC = Math.max(1, ...CH.map((c) => ch[c[0]] || 0));
  const hasAny = tot.views || tot.opens || tot.cart || tot.clicks;
  body.innerHTML =
    '<div class="st-cards">' +
      '<div class="st-card"><b>' + nf(tot.views) + '</b><span>👀 Візити</span></div>' +
      '<div class="st-card"><b>' + nf(tot.opens) + '</b><span>🔎 Відкриття товарів</span></div>' +
      '<div class="st-card"><b>' + nf(tot.cart) + '</b><span>🛒 Додавання в кошик</span></div>' +
      '<div class="st-card"><b>' + nf(tot.clicks) + '</b><span>📨 Кліки «замовити»</span></div>' +
    '</div>' +
    (hasAny ? '' : '<p class="muted">За цей період даних ще немає.</p>') +
    '<h3 class="st-h">👀 Візити по днях <span class="muted small">(' + stRange + ' днів, макс. ' + nf(maxV === 1 && !per.some((p) => p.v) ? 0 : maxV) + ' на день)</span></h3>' + bars +
    '<h3 class="st-h">🔝 Топ-10 відкритих товарів</h3>' +
    (top.length ? '<ol class="st-top">' + top.map((k) => '<li><span class="st-top__n">' + esc(names[k] || k) + '</span><span class="st-bar"><i style="width:' + Math.max(4, Math.round(prod[k] / maxP * 100)) + '%"></i></span><b>' + nf(prod[k]) + '</b></li>').join('') + '</ol>' : '<p class="muted small">Ще немає відкриттів товарів.</p>') +
    '<h3 class="st-h">📨 Кліки по каналах замовлення</h3>' +
    '<ul class="st-top st-top--ch">' + CH.map((c) => '<li><span class="st-top__n">' + c[1] + '</span><span class="st-bar"><i style="width:' + Math.round((ch[c[0]] || 0) / maxC * 100) + '%"></i></span><b>' + nf(ch[c[0]] || 0) + '</b></li>').join('') + '</ul>' +
    cartEventsHTML(days, names);
  if (ctx.lazy) ctx.lazy(); // фото товарів, додані в адмінці (photos/*)
}

/* ---------- 08.10.2026: «Що додають у кошик» (cart_events) ---------- */
const IC_CART = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>';
const IC_USER = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';
const IC_GUEST = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2.5"/><path d="M11 18h2"/></svg>';
const IC_CLOCK = '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
const IC_LINK = '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M19 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4"/></svg>';
const IC_X = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
const IC_DOWN = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
const IC_UP = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>';
const IC_FILTER = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h18l-7 8.5V19l-4 2v-7.5z"/></svg>';
const CE_PAGE = 20, CE_TOP = 10;
let ceShow = CE_PAGE, cePid = '', ceTopAll = false;
const ceDtf = new Intl.DateTimeFormat('uk-UA', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const ceDate = (e) => { try { return e.ts && e.ts.toDate ? e.ts.toDate() : null; } catch (x) { return null; } };
const ceThumb = (p) => ctx.thumb(p).replace(' loading="lazy"', ''); // у списку до 20 рядків — фото одразу
const ceUrl = (pid) => './' + (ctx.fb && ctx.fb.emu ? '?emu=1' : '') + '#/p/' + encodeURIComponent(pid);
const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? b : c; };
const addsTxt = (n) => nf(n) + '\u00a0' + plural(n, 'додавання', 'додавання', 'додавань');
function ceWho(e) {
  if (e.uid) {
    const nm = e.who ? esc(e.who) : '', em = e.email ? esc(e.email) : '';
    return '<span class="ce-who ce-who--u" title="Покупець з акаунтом">' + IC_USER + '<span><b>' + (nm || em || 'Покупець з акаунтом') + '</b>' + (nm && em ? '<small>' + em + '</small>' : '<small>акаунт</small>') + '</span></span>';
  }
  return '<span class="ce-who" title="Гість без входу. Анонімний id пристрою: ' + esc(e.dev || '—') + '">' + IC_GUEST + '<span><b>Гість</b><small>пристрій ' + esc(String(e.dev || '—').slice(0, 6)) + '</small></span></span>';
}
function cePrice(e) {
  const q = Math.max(1, num(e.qty));
  if (typeof e.price !== 'number') return '<span class="ce-pr ce-pr--ask">ціну уточнюйте</span>';
  return '<span class="ce-pr">' + nf(q) + ' × ' + grn(e.price) + (typeof e.old === 'number' && e.old > e.price ? ' <s>' + grn(e.old) + '</s>' : '') + '</span>' +
    (q > 1 ? '<span class="ce-sum">= ' + grn(e.price * q) + '</span>' : '');
}
function ceRow(e, P) {
  const p = P[e.pid], d = ceDate(e), url = ceUrl(e.pid), nm = e.name || (p && p.name) || e.pid;
  return '<li class="ce-it">' +
    '<a class="ce-ph" href="' + esc(url) + '" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">' + ceThumb(p) + '</a>' +
    '<div class="ce-p">' +
      '<a class="ce-n" href="' + esc(url) + '" target="_blank" rel="noopener" title="Відкрити сторінку товару">' + esc(nm) + IC_LINK + '</a>' +
      (e.variant ? '<span class="ce-v">Варіант: <b>' + esc(e.variant) + '</b></span>' : '') +
      '<span class="ce-s">' + (p ? '' : '<span class="ce-gone">немає в каталозі</span> ') + (e.sec ? 'Звідки: ' + esc(e.sec) : '') + '</span>' +
    '</div>' +
    '<div class="ce-q"><b>' + nf(Math.max(1, num(e.qty))) + '\u00a0шт</b>' + cePrice(e) + '</div>' +
    '<div class="ce-m"><span class="ce-t">' + IC_CLOCK + (d ? ceDtf.format(d).replace(',', '') : '—') + '</span>' + ceWho(e) + '</div>' +
  '</li>';
}
function cartEventsHTML(days, names) {
  const head = '<h2 class="st-h2" id="ce-h">' + IC_CART + 'Що додають у кошик</h2>';
  if (ceErr === 'perm') return head + '<p class="ed__msg">Немає доступу до журналу кошика. Опублікуйте нові правила Firestore (Firebase Console → Firestore Database → Rules) — з блоком cart_events.</p>';
  if (ceErr) return head + '<p class="ed__msg">Помилка читання журналу кошика: ' + esc(ceErr) + '</p>';
  if (!ceDocs) return head + '<p class="muted">Завантаження…</p>';
  const P = ctx.products ? ctx.products() : {};
  const set = new Set(days);
  const list = ceDocs.filter((e) => { const d = ceDate(e); return d && set.has(kyivDay(d)); });
  const units = list.reduce((s, e) => s + num(e.qty), 0);
  const sum = list.reduce((s, e) => s + (typeof e.price === 'number' ? e.price * num(e.qty) : 0), 0);
  const people = new Set(list.map((e) => (e.uid ? 'u:' + e.uid : 'd:' + (e.dev || e.id)))).size;
  const signed = new Set(list.filter((e) => e.uid).map((e) => e.uid)).size;
  // по днях
  const perDay = {}; list.forEach((e) => { const k = kyivDay(ceDate(e)); perDay[k] = (perDay[k] || 0) + 1; });
  const maxD = Math.max(1, ...days.map((d) => perDay[d] || 0));
  const wd = new Intl.DateTimeFormat('uk-UA', { weekday: 'short', timeZone: 'UTC' });
  const bars = '<div class="stc stc--ce stc--' + stRange + '" role="img" aria-label="Додавання в кошик по днях">' + days.map((d, i) => {
    const v = perDay[d] || 0, dt = new Date(d + 'T00:00:00Z');
    const lbl = stRange <= 7 ? wd.format(dt) + '<br>' + d.slice(8) + '.' + d.slice(5, 7) : (i % 5 === 4 || i === days.length - 1 ? d.slice(8) + '.' + d.slice(5, 7) : '');
    return '<div class="stc__c" title="' + d.slice(8) + '.' + d.slice(5, 7) + ': ' + v + ' дод."><span class="stc__v">' + (stRange <= 7 || v === maxD ? (v || '') : '') + '</span>' +
      '<span class="stc__b" style="height:' + (v ? Math.max(3, Math.round(v / maxD * 100)) : 0) + '%"></span><span class="stc__l">' + lbl + '</span></div>';
  }).join('') + '</div>';
  // топ товарів (кожен — кнопка: показати всі додавання цього товару)
  const top = {}; list.forEach((e) => { const t = top[e.pid] || (top[e.pid] = { n: 0, q: 0, name: e.name }); t.n++; t.q += num(e.qty); });
  const allIds = Object.keys(top).sort((a, b) => top[b].n - top[a].n || top[b].q - top[a].q || a.localeCompare(b));
  const topIds = ceTopAll ? allIds : allIds.slice(0, CE_TOP);
  const maxT = Math.max(1, ...allIds.map((k) => top[k].n));
  const tName = (k) => names[k] || top[k].name || k;
  const topHTML = topIds.length ? '<ol class="st-top st-top--ce">' + topIds.map((k) =>
    '<li' + (k === cePid ? ' class="on"' : '') + '><button type="button" class="ce-topb" data-ce-pid="' + esc(k) + '" aria-pressed="' + (k === cePid) + '" title="Показати всі додавання цього товару">' +
      '<span class="st-top__n">' + esc(tName(k)) + ' <small class="muted">· ' + nf(top[k].q) + ' шт</small></span>' +
      '<span class="st-bar"><i style="width:' + Math.max(4, Math.round(top[k].n / maxT * 100)) + '%"></i></span><b>' + nf(top[k].n) + '</b></button></li>').join('') + '</ol>' +
    (allIds.length > CE_TOP ? '<button class="btn btn--o adm-sm ce-more" type="button" data-ce-topall>' + (ceTopAll ? IC_UP + 'Згорнути до топ-' + CE_TOP : IC_DOWN + 'Показати всі товари (' + nf(allIds.length) + ')') + '</button>' : '')
    : '<p class="muted small">Ще немає даних.</p>';
  // список додавань (новіші зверху; за потреби — лише вибраний товар)
  const feedAll = cePid ? list.filter((e) => e.pid === cePid) : list;
  const feed = feedAll.slice(0, ceShow);
  let sel = '';
  if (cePid) {
    const p = P[cePid], vars = {};
    feedAll.forEach((e) => { const k = e.variant || ''; const v = vars[k] || (vars[k] = { n: 0, q: 0 }); v.n++; v.q += num(e.qty); });
    const vk = Object.keys(vars).sort((a, b) => vars[b].n - vars[a].n || a.localeCompare(b));
    const q = feedAll.reduce((s, e) => s + num(e.qty), 0);
    sel = '<div class="ce-sel">' +
      '<a class="ce-ph" href="' + esc(ceUrl(cePid)) + '" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">' + ceThumb(p) + '</a>' +
      '<div class="ce-sel__i"><span class="ce-sel__k">' + IC_FILTER + 'Вибраний товар</span>' +
        '<a class="ce-n" href="' + esc(ceUrl(cePid)) + '" target="_blank" rel="noopener">' + esc((p && p.name) || (top[cePid] && top[cePid].name) || cePid) + IC_LINK + '</a>' +
        '<span class="ce-sel__s">' + addsTxt(feedAll.length) + ' · ' + nf(q) + ' шт за вибраний період</span>' +
        (vk.length > 1 || (vk.length === 1 && vk[0]) ? '<span class="ce-vars">' + vk.map((k) => '<span class="ce-var">' + esc(k || 'без варіанта') + ' <b>' + nf(vars[k].n) + '</b> <small>· ' + nf(vars[k].q) + ' шт</small></span>').join('') + '</span>' : '') +
      '</div>' +
      '<button class="btn btn--o adm-sm ce-sel__x" type="button" data-ce-clear>' + IC_X + 'Усі товари</button>' +
    '</div>';
  }
  const left = feedAll.length - feed.length;
  return head +
    '<div class="st-cards">' +
      '<div class="st-card"><b>' + nf(list.length) + '</b><span>Додавань у кошик</span></div>' +
      '<div class="st-card"><b>' + nf(units) + '</b><span>Одиниць товару</span></div>' +
      '<div class="st-card"><b>' + grn(sum) + '</b><span>На суму (за цінами сайту)</span></div>' +
      '<div class="st-card"><b>' + nf(people) + '</b><span>Покупців · з акаунтом: ' + nf(signed) + '</span></div>' +
    '</div>' +
    (list.length ? '' : '<p class="muted">За цей період додавань у кошик ще немає.</p>') +
    '<h3 class="st-h">Додавання по днях <span class="muted small">(' + stRange + ' ' + (stRange === 1 ? 'день' : 'днів') + ')</span></h3>' + bars +
    '<h3 class="st-h">Топ товарів за додаваннями <span class="muted small">— натисніть товар, щоб побачити всі його додавання</span></h3>' + topHTML +
    '<h3 class="st-h" id="ce-feed">' + (cePid ? 'Усі додавання товару' : 'Останні додавання') + ' <span class="muted small">(новіші зверху · показано ' + nf(feed.length) + ' з ' + nf(feedAll.length) + ' · час київський)</span></h3>' +
    sel +
    (feed.length ? '<ul class="ce-feed">' + feed.map((e) => ceRow(e, P)).join('') + '</ul>' : '<p class="muted small">' + (cePid ? 'За цей період цей товар у кошик не додавали.' : 'Ще немає додавань.') + '</p>') +
    (left > 0 ? '<button class="btn btn--o adm-sm ce-more ce-more--feed" type="button" data-ce-more>' + IC_DOWN + 'Показати ще ' + nf(Math.min(CE_PAGE, left)) + (left > CE_PAGE ? ' · залишилось ' + nf(left) : '') + '</button>' : '') +
    (ceDocs.length >= CE_LIMIT ? '<p class="muted small">Завантажено останні ' + nf(CE_LIMIT) + ' подій за 31 день.</p>' : '');
}
function ceScroll() { const h = $('#ce-feed'); if (h) h.scrollIntoView({ block: 'start', behavior: 'smooth' }); }

/* ---------- події (викликає admin.js) ---------- */
export function extrasClick(t) {
  if (t.hasAttribute('data-oflt')) { flt = t.getAttribute('data-oflt'); renderOrders(); return true; }
  if (t.hasAttribute('data-odel')) { delOrder(t); return true; }
  if (t.hasAttribute('data-st-range')) { { const r = +t.getAttribute('data-st-range'); stRange = r === 30 ? 30 : r === 1 ? 1 : 7; } ceShow = CE_PAGE; renderStats(); return true; }
  if (t.hasAttribute('data-ce-pid')) { const id = t.getAttribute('data-ce-pid'); cePid = cePid === id ? '' : id; ceShow = CE_PAGE; renderStats(); if (cePid) ceScroll(); return true; }
  if (t.hasAttribute('data-ce-clear')) { cePid = ''; ceShow = CE_PAGE; renderStats(); ceScroll(); return true; }
  if (t.hasAttribute('data-ce-more')) { ceShow += CE_PAGE; renderStats(); return true; }
  if (t.hasAttribute('data-ce-topall')) { ceTopAll = !ceTopAll; renderStats(); return true; }
  if (t.hasAttribute('data-st-reload')) { loadStats(); return true; }
  return false;
}
export function extrasChange(t) {
  if (t.hasAttribute('data-ost')) { setStatus(t); return true; }
  if (t.id === 'st-nostats') { try { if (t.checked) localStorage.setItem('alexbes_nostats', '1'); else localStorage.removeItem('alexbes_nostats'); } catch (e) {} ctx.toast(t.checked ? 'Ваші відвідування з цього пристрою не рахуються' : 'Ваші відвідування знову рахуються'); return true; }
  return false;
}
export function extrasInput(t) { if (t.id === 'ord-q') { oq = t.value; renderOrders(); return true; } return false; }
