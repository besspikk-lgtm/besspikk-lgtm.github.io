/* Alex_bes😈 — адмінка: «📦 Замовлення» (orders/{id}) і «📊 Статистика» (stats/{YYYY-MM-DD}). Підключає js/admin.js. */
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

let ctx = null; // { fb, toast, names() }
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
    '<ul class="st-top st-top--ch">' + CH.map((c) => '<li><span class="st-top__n">' + c[1] + '</span><span class="st-bar"><i style="width:' + Math.round((ch[c[0]] || 0) / maxC * 100) + '%"></i></span><b>' + nf(ch[c[0]] || 0) + '</b></li>').join('') + '</ul>';
}

/* ---------- події (викликає admin.js) ---------- */
export function extrasClick(t) {
  if (t.hasAttribute('data-oflt')) { flt = t.getAttribute('data-oflt'); renderOrders(); return true; }
  if (t.hasAttribute('data-odel')) { delOrder(t); return true; }
  if (t.hasAttribute('data-st-range')) { { const r = +t.getAttribute('data-st-range'); stRange = r === 30 ? 30 : r === 1 ? 1 : 7; } renderStats(); return true; }
  if (t.hasAttribute('data-st-reload')) { loadStats(); return true; }
  return false;
}
export function extrasChange(t) {
  if (t.hasAttribute('data-ost')) { setStatus(t); return true; }
  if (t.id === 'st-nostats') { try { if (t.checked) localStorage.setItem('alexbes_nostats', '1'); else localStorage.removeItem('alexbes_nostats'); } catch (e) {} ctx.toast(t.checked ? 'Ваші відвідування з цього пристрою не рахуються' : 'Ваші відвідування знову рахуються'); return true; }
  return false;
}
export function extrasInput(t) { if (t.id === 'ord-q') { oq = t.value; renderOrders(); return true; } return false; }
