/* Alex_bes — адмінка: міні-CRM «Клієнти» (22.10.2026).
   Клієнти будуються з orders/* (групування за номером телефону, інакше — Telegram-нік або ім'я).
   Нотатки, теги й нагадування — ПРИВАТНО в users/{uid адміна}.np (поле профілю, яке правила дозволяють
   власнику записувати без обмеження типу; читати users/* може лише власник і адмін). Публічні products/* — НЕ використовуються. */
import { authErr, esc } from './fb-common.js?v=2';

const $ = (s, r) => (r || document).querySelector(s);
const TZ = 'Europe/Kyiv';
const MAX_ORDERS = 1000, DOC_LIMIT = 900000; // документ Firestore ≤ 1 МБ — лишаємо запас
const ST = { new: 'Нове', confirmed: 'Підтверджено', shipped: 'Відправлено', paid: 'Оплачено', cancelled: 'Скасовано' };
const CH = { site: 'Сайт', telegram: 'Telegram', whatsapp: 'WhatsApp', bot: 'Бот', other: 'Інше' };
const TAGS = ['оптовик', 'СТО', 'постійний', 'новий', 'VIP', 'проблемний'];
const grn = (n) => String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') + '\u00a0грн';
const dtf = new Intl.DateTimeFormat('uk-UA', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
const dtt = new Intl.DateTimeFormat('uk-UA', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const kyivDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d || new Date());
const I = {
  phone: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2"/>',
  tg: '<path d="m21 4-18 7 6 2 2 6 3-4 5 4z"/><path d="m9 13 8-6"/>',
  wa: '<path d="M4 20l1.3-4A8.5 8.5 0 1 1 8 18.7z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 0 1-1.8-1.8l.8-1-1-2z"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  back: '<path d="M15 6l-6 6 6 6"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>', ok: '<path d="m5 12 4.5 4.5L19 7"/>', open: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>'
};
const svg = (k, s) => '<svg viewBox="0 0 24 24" width="' + (s || 17) + '" height="' + (s || 17) + '" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + I[k] + '</svg>';

let fb = null, toast = (m) => console.log(m), uid = '';
let orders = null, oErr = '', crm = { v: 1, c: {} }, crmOk = false, crmErr = '', saving = null;
let q = '', sort = 'last', fch = 'all', ftag = 'all', fx = 'all', open = null, busy = false;

/* ---------- нормалізація ---------- */
export function normPhone(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.length === 10 && d[0] === '0') d = '38' + d;
  if (d.length === 9) d = '380' + d;
  if (d.length === 11 && d.startsWith('80')) d = '3' + d;
  return d.length >= 9 ? d : '';
}
function tgOf(o) { const m = /(?:^|[\s(,;:])@([A-Za-z][A-Za-z0-9_]{3,31})\b/.exec([o.note, o.name, o.text].filter(Boolean).join(' ')); return m ? m[1] : ''; }
function parseAll(s) { try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a.filter((x) => x && typeof x === 'object') : []; } catch (e) { return []; } }
function chOf(o) {
  const a = parseAll(o.items).find((x) => x.id === '_acct'), c = a && a.ch ? String(a.ch) : '';
  if (c === 'whatsapp') return 'whatsapp';
  if (c === 'telegram-personal' || c === 'telegram') return 'telegram';
  if (c === 'bot') return 'bot';
  if (c) return c === 'viber' || c === 'instagram' || c === 'copy' ? 'other' : 'site';
  return typeof o.text === 'string' && o.text.startsWith('Швидке замовлення') ? 'site' : 'bot';
}
const tsOf = (o) => { try { return o.createdAt && o.createdAt.toDate ? o.createdAt.toDate().getTime() : (typeof o.createdAt === 'number' ? o.createdAt : 0); } catch (e) { return 0; } };
export function keyOf(o) {
  const p = normPhone(o.phone); if (p) return 'p' + p;
  const t = tgOf(o); if (t) return 't' + t.toLowerCase();
  const n = String(o.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return n ? 'n' + n.replace(/[^a-zа-яіїєґ0-9' -]/gi, '').slice(0, 60) : '';
}
export function buildClients(list) {
  const m = new Map();
  list.forEach((o) => {
    const k = keyOf(o); if (!k) return;
    let c = m.get(k);
    if (!c) { c = { key: k, name: '', phone: '', tg: '', city: '', orders: [], ch: new Set(), sum: 0, paidN: 0, first: 0, last: 0 }; m.set(k, c); }
    const t = tsOf(o), st = ST[o.status] ? o.status : 'new', items = parseAll(o.items).filter((x) => x.id !== '_acct');
    c.orders.push({ id: o.id, t, st, items, total: typeof o.total_uah === 'number' ? o.total_uah : null, ch: chOf(o) });
    c.ch.add(chOf(o));
    if (st !== 'cancelled' && typeof o.total_uah === 'number') { c.sum += o.total_uah; c.paidN++; }
    if (!c.first || (t && t < c.first)) c.first = t;
    if (t >= c.last) { c.last = t; if (o.name) c.name = String(o.name).trim(); if (o.city) c.city = String(o.city).trim(); }
    if (!c.name && o.name) c.name = String(o.name).trim();
    if (!c.phone && o.phone) c.phone = String(o.phone).trim();
    if (!c.tg) c.tg = tgOf(o);
  });
  const out = Array.from(m.values());
  out.forEach((c) => { c.orders.sort((a, b) => b.t - a.t); c.avg = c.paidN ? c.sum / c.paidN : 0; });
  return out;
}

/* ---------- приватне сховище CRM: users/{uid}.np = { crm: 1, v: 1, c: { key: {n, t:[], r:[{id,d,x,done}]} } } ---------- */
const meta = (k) => crm.c[k] || { n: '', t: [], r: [] };
function setMeta(k, m) { if (!m.n && !m.t.length && !m.r.length) delete crm.c[k]; else crm.c[k] = m; }
const docSize = () => new Blob([JSON.stringify(crm)]).size;
async function loadCrm() {
  const { F, db } = fb;
  try {
    const s = await F.getDoc(F.doc(db, 'users', uid));
    const np = s.exists() ? s.data().np : null;
    if (np && typeof np === 'object' && np.crm) crm = { v: 1, c: (np.c && typeof np.c === 'object') ? np.c : {} };
    else if (typeof np === 'string' && np) crmErr = 'У вашому профілі (поле «Відділення НП») є текст «' + np.slice(0, 40) + '» — під час першого збереження CRM він буде замінений.';
    crmOk = true;
  } catch (e) { crmErr = authErr(e); crmOk = false; }
}
function saveCrm() {
  if (!crmOk) { toast('CRM не завантажено — зберегти не можна'); return Promise.resolve(false); }
  const size = docSize();
  if (size > DOC_LIMIT) { toast('Забагато нотаток: ' + Math.round(size / 1024) + ' КБ з ~880 КБ. Скоротіть нотатки або видаліть старі нагадування.'); return Promise.resolve(false); }
  const { F, db } = fb;
  saving = F.setDoc(F.doc(db, 'users', uid), { np: { crm: 1, v: 1, c: crm.c }, updatedAt: Date.now() }, { merge: true })
    .then(() => { toast('Збережено'); badge(); return true; })
    .catch((e) => { toast('Не збережено: ' + authErr(e)); return false; });
  return saving;
}

/* ---------- нагадування ---------- */
function allRem() {
  const out = [];
  Object.keys(crm.c).forEach((k) => (crm.c[k].r || []).forEach((r) => { if (!r.done) out.push(Object.assign({ key: k }, r)); }));
  return out.sort((a, b) => String(a.d).localeCompare(String(b.d)));
}
function dueN() { const t = kyivDay(); return allRem().filter((r) => r.d <= t).length; }
export function badge() {
  const a = document.querySelector('#adm-tabs [data-tab="clients"]'); if (!a) return;
  let b = a.querySelector('.crm-badge'); const n = dueN();
  if (!n) { if (b) b.remove(); return; }
  if (!b) { b = document.createElement('span'); b.className = 'adm-badge crm-badge'; a.appendChild(b); }
  b.textContent = n; b.title = 'Нагадувань на сьогодні й прострочених: ' + n;
}

/* ---------- init / load ---------- */
export async function initCrm(f, t, u) {
  fb = f; if (t) toast = t; uid = u.uid; orders = null; crm = { v: 1, c: {} }; crmOk = false; crmErr = ''; open = null;
  const box = $('#crm-box'); if (box && !box._crm) { box._crm = 1; box.addEventListener('click', onClick); box.addEventListener('input', onInput); box.addEventListener('change', onChange); }
  await loadCrm(); badge();
}
export async function loadCrmOrders(force) {
  if (busy || (orders && !force)) { renderCrm(); return; }
  busy = true; renderCrm();
  try {
    const { F, db } = fb;
    const qs = await F.getDocs(F.query(F.collection(db, 'orders'), F.orderBy('createdAt', 'desc'), F.limit(MAX_ORDERS)));
    orders = qs.docs.map((d) => Object.assign({ id: d.id }, d.data())).filter((o) => !(typeof o.text === 'string' && o.text.startsWith('Відгук на товар')));
    oErr = '';
  } catch (e) { oErr = authErr(e); }
  busy = false; renderCrm();
}

/* ---------- render ---------- */
function telHref(p) { const d = normPhone(p); return d ? '+' + d : ''; }
function contactLinks(c) {
  const t = telHref(c.phone), out = [];
  if (t) out.push('<a class="btn btn--o adm-sm" href="tel:' + t + '">' + svg('phone') + esc(c.phone) + '</a>', '<a class="btn btn--o adm-sm" href="https://wa.me/' + t.slice(1) + '" target="_blank" rel="noopener">' + svg('wa') + 'WhatsApp</a>');
  if (c.tg) out.push('<a class="btn btn--o adm-sm" href="https://t.me/' + esc(c.tg) + '" target="_blank" rel="noopener">' + svg('tg') + '@' + esc(c.tg) + '</a>');
  else if (t) out.push('<a class="btn btn--o adm-sm" href="https://t.me/' + t + '" target="_blank" rel="noopener">' + svg('tg') + 'Telegram</a>');
  return out.join('');
}
const tagHTML = (t) => '<span class="crm-tag">' + esc(t) + '</span>';
const chHTML = (s) => Array.from(s).map((c) => '<span class="crm-ch crm-ch--' + c + '">' + (CH[c] || c) + '</span>').join('');
function remListHTML() {
  const t = kyivDay(), r = allRem(), due = r.filter((x) => x.d <= t), soon = r.filter((x) => x.d > t).slice(0, 5);
  const row = (x) => { const c = clientsMap()[x.key]; const nm = c ? (c.name || c.phone || '—') : (x.key.slice(1)); return '<li class="crm-rem' + (x.d < t ? ' is-over' : x.d === t ? ' is-today' : '') + '"><span class="crm-rem__d">' + (x.d < t ? 'Прострочено · ' : x.d === t ? 'Сьогодні · ' : '') + esc(fmtD(x.d)) + '</span><button type="button" class="crm-link" data-crm-open="' + esc(x.key) + '">' + esc(nm) + '</button><span class="crm-rem__x">' + esc(x.x) + '</span><button type="button" class="btn btn--o adm-sm" data-crm-done="' + esc(x.key) + '|' + esc(x.id) + '" title="Виконано">' + svg('ok') + 'Виконано</button></li>'; };
  return '<section class="crm-rems" aria-label="Нагадування"><h3>' + svg('bell', 18) + 'Нагадування <span class="muted small">' + (due.length ? 'на сьогодні й прострочені: ' + due.length : 'на сьогодні немає') + '</span></h3>' +
    (due.length ? '<ul>' + due.map(row).join('') + '</ul>' : '') +
    (soon.length ? '<details' + (due.length ? '' : ' open') + '><summary class="muted small">Найближчі (' + soon.length + ')</summary><ul>' + soon.map(row).join('') + '</ul></details>' : (due.length ? '' : '<p class="muted small">Додайте нагадування «передзвонити» в картці клієнта.</p>')) + '</section>';
}
const fmtD = (d) => { const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(d || ''); return m ? m[3] + '.' + m[2] + '.' + m[1] : d; };
let _cm = null, _cmSrc = null;
function clientsMap() { if (_cmSrc !== orders) { _cmSrc = orders; _cm = Object.fromEntries(buildClients(orders || []).map((c) => [c.key, c])); } return _cm; }
function filtered() {
  const ql = q.trim().toLowerCase(), qd = ql.replace(/\D/g, '');
  let a = Object.values(clientsMap());
  a = a.filter((c) => {
    const m = meta(c.key);
    if (fch !== 'all' && !c.ch.has(fch)) return false;
    if (ftag !== 'all' && !(m.t || []).includes(ftag)) return false;
    if (fx === 'rem' && !(m.r || []).some((r) => !r.done)) return false;
    if (fx === 'note' && !m.n) return false;
    if (fx === 'repeat' && c.orders.length < 2) return false;
    if (!ql) return true;
    const hay = [c.name, c.phone, c.tg, c.city, m.n, (m.t || []).join(' ')].concat(c.orders.map((o) => o.id + ' ' + o.items.map((i) => i.name).join(' '))).join(' ').toLowerCase();
    return hay.includes(ql) || (qd.length >= 3 && normPhone(c.phone).includes(qd));
  });
  const S = { last: (x, y) => y.last - x.last, sum: (x, y) => y.sum - x.sum, count: (x, y) => y.orders.length - x.orders.length || y.last - x.last, name: (x, y) => (x.name || '').localeCompare(y.name || '', 'uk') };
  return a.sort(S[sort] || S.last);
}
function toolsHTML() {
  const tags = new Set(TAGS); Object.values(crm.c).forEach((m) => (m.t || []).forEach((t) => tags.add(t)));
  const opt = (v, l, cur) => '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(l) + '</option>';
  return '<div class="crm-tools"><label class="cl-q"><input id="crm-q" type="search" placeholder="Пошук: ім’я, телефон, @нік, товар, нотатка…" value="' + esc(q) + '" autocomplete="off"></label>' +
    '<select id="crm-sort" aria-label="Сортування">' + opt('last', 'Останнє замовлення', sort) + opt('sum', 'Сума покупок', sort) + opt('count', 'Кількість замовлень', sort) + opt('name', 'Ім’я А–Я', sort) + '</select>' +
    '<select id="crm-ch" aria-label="Канал">' + opt('all', 'Усі канали', fch) + Object.keys(CH).map((k) => opt(k, CH[k], fch)).join('') + '</select>' +
    '<select id="crm-tagf" aria-label="Тег">' + opt('all', 'Усі теги', ftag) + Array.from(tags).map((t) => opt(t, t, ftag)).join('') + '</select>' +
    '<select id="crm-x" aria-label="Фільтр">' + opt('all', 'Усі клієнти', fx) + opt('repeat', '2+ замовлення', fx) + opt('rem', 'З нагадуваннями', fx) + opt('note', 'З нотатками', fx) + '</select>' +
    '<button class="btn btn--o adm-sm" type="button" data-crm-reload>Оновити</button></div>';
}
function listHTML() {
  const a = filtered();
  if (!a.length) return '<p class="muted">Клієнтів не знайдено.</p>';
  return '<p class="muted small">Клієнтів: ' + a.length + ' · замовлень: ' + a.reduce((s, c) => s + c.orders.length, 0) + ' · сума: ' + grn(a.reduce((s, c) => s + c.sum, 0)) + '</p><ul class="crm-list">' + a.slice(0, 300).map((c) => {
    const m = meta(c.key), rem = (m.r || []).filter((r) => !r.done).length;
    return '<li><button type="button" class="crm-row" data-crm-open="' + esc(c.key) + '"><span class="crm-row__n"><b>' + esc(c.name || 'Без імені') + '</b><span class="muted small">' + esc(c.phone || (c.tg ? '@' + c.tg : '')) + (c.city ? ' · ' + esc(c.city) : '') + '</span>' +
      ((m.t || []).length || rem ? '<span class="crm-tags">' + (m.t || []).map(tagHTML).join('') + (rem ? '<span class="crm-tag crm-tag--r">' + svg('bell', 13) + rem + '</span>' : '') + '</span>' : '') + '</span>' +
      '<span class="crm-row__s"><b>' + grn(c.sum) + '</b><span class="muted small">' + c.orders.length + ' замовл. · ' + (c.last ? dtf.format(new Date(c.last)) : '—') + '</span><span class="crm-chs">' + chHTML(c.ch) + '</span></span></button></li>';
  }).join('') + '</ul>' + (a.length > 300 ? '<p class="muted small">Показано 300 — уточніть пошук.</p>' : '');
}
function cardHTML(c) {
  const m = meta(c.key), t = kyivDay();
  const tags = new Set(TAGS.concat(m.t || []));
  return '<div class="crm-card"><button type="button" class="btn btn--o adm-sm" data-crm-back>' + svg('back') + 'До списку</button>' +
    '<h3 class="crm-card__h">' + esc(c.name || 'Без імені') + '</h3>' + (c.city ? '<p class="muted small">' + esc(c.city) + '</p>' : '') +
    '<div class="crm-acts">' + contactLinks(c) + '</div>' +
    '<dl class="crm-tot"><div><dt>Замовлень</dt><dd>' + c.orders.length + '</dd></div><div><dt>Сума покупок</dt><dd>' + grn(c.sum) + '</dd></div><div><dt>Середній чек</dt><dd>' + (c.paidN ? grn(c.avg) : '—') + '</dd></div><div><dt>Перше</dt><dd>' + (c.first ? dtf.format(new Date(c.first)) : '—') + '</dd></div><div><dt>Останнє</dt><dd>' + (c.last ? dtf.format(new Date(c.last)) : '—') + '</dd></div><div><dt>Канали</dt><dd>' + chHTML(c.ch) + '</dd></div></dl>' +
    '<p class="muted small">Сума — без скасованих замовлень і позицій «ціну уточнити».</p>' +
    '<h4>Теги</h4><div class="crm-tagpick">' + Array.from(tags).map((x) => '<label class="chip' + ((m.t || []).includes(x) ? ' on' : '') + '"><input type="checkbox" data-crm-tag="' + esc(x) + '"' + ((m.t || []).includes(x) ? ' checked' : '') + '>' + esc(x) + '</label>').join('') +
    '<input id="crm-newtag" maxlength="30" placeholder="Свій тег + Enter"></div>' +
    '<h4>Нотатки</h4><textarea id="crm-note" rows="4" maxlength="3000" placeholder="Що купує, яке авто/СТО, домовленості…">' + esc(m.n || '') + '</textarea><button class="btn btn--y adm-sm" type="button" data-crm-savenote>Зберегти нотатку</button>' +
    '<h4>Нагадування</h4><ul class="crm-rlist">' + (m.r || []).slice().sort((a, b) => String(a.d).localeCompare(b.d)).map((r) => '<li class="' + (r.done ? 'is-done' : r.d < t ? 'is-over' : r.d === t ? 'is-today' : '') + '"><span class="crm-rem__d">' + esc(fmtD(r.d)) + '</span><span>' + esc(r.x) + '</span>' +
      (r.done ? '<span class="muted small">виконано</span>' : '<button type="button" class="btn btn--o adm-sm" data-crm-done="' + esc(c.key) + '|' + esc(r.id) + '">' + svg('ok') + 'Виконано</button>') + '<button type="button" class="btn btn--o adm-sm" data-crm-rdel="' + esc(r.id) + '" title="Видалити">' + svg('x') + '</button></li>').join('') + '</ul>' +
    '<div class="crm-radd"><input type="date" id="crm-rd" value="' + t + '"><input id="crm-rx" maxlength="300" value="Передзвонити" placeholder="Що зробити"><button class="btn btn--y adm-sm" type="button" data-crm-radd>' + svg('bell') + 'Додати</button></div>' +
    '<h4>Замовлення (' + c.orders.length + ')</h4><ul class="crm-orders">' + c.orders.map((o) => '<li><button type="button" class="crm-ord" data-crm-ord="' + esc(o.id) + '" title="Відкрити у «Замовленнях»"><span><b>' + (o.t ? dtt.format(new Date(o.t)) : '—') + '</b> <span class="crm-st crm-st--' + o.st + '">' + ST[o.st] + '</span> <span class="crm-ch crm-ch--' + o.ch + '">' + (CH[o.ch] || o.ch) + '</span></span>' +
      '<span class="crm-ord__i">' + o.items.map((i) => esc(i.name || i.id) + (i.variant ? ' (' + esc(i.variant) + ')' : '') + ' × ' + (parseInt(i.qty, 10) || 1)).join('; ') + '</span><span class="crm-ord__s">' + (o.total == null ? 'ціну уточнити' : grn(o.total)) + svg('open', 15) + '</span></button></li>').join('') + '</ul>' +
    '<p class="muted small">Нотатки, теги й нагадування видно лише вам в адмінці (приватний запис вашого акаунта; на сайті не показуються).</p></div>';
}
export function renderCrm() {
  const box = $('#crm-box'); if (!box) return;
  if (!fb) { box.innerHTML = ''; return; }
  const ae = document.activeElement, keep = ae && ae.id === 'crm-q' ? [ae.selectionStart] : null;
  let h = '<h2 class="crm-h">Клієнти з замовлень</h2>';
  if (crmErr) h += '<p class="muted small">' + esc(crmErr) + '</p>';
  if (oErr) h += '<p class="adm-err">Не вдалося завантажити замовлення: ' + esc(oErr) + '</p>';
  else if (!orders) h += '<p class="muted">Завантаження замовлень…</p>';
  else {
    h += remListHTML();
    const c = open && clientsMap()[open];
    h += c ? cardHTML(c) : toolsHTML() + listHTML();
  }
  box.innerHTML = h;
  if (keep) { const i = $('#crm-q'); if (i) { i.focus(); try { i.setSelectionRange(keep[0], keep[0]); } catch (e) {} } }
  badge();
}

/* ---------- події ---------- */
function upd(k, fn) { const m = JSON.parse(JSON.stringify(meta(k))); m.t = m.t || []; m.r = m.r || []; m.n = m.n || ''; fn(m); setMeta(k, m); return saveCrm().then(() => renderCrm()); }
function onClick(e) {
  const t = e.target.closest('button,[data-crm-open]'); if (!t) return;
  if (t.hasAttribute('data-crm-open')) { open = t.getAttribute('data-crm-open'); renderCrm(); $('#crm-box').scrollIntoView({ block: 'start' }); return; }
  if (t.hasAttribute('data-crm-back')) { open = null; renderCrm(); return; }
  if (t.hasAttribute('data-crm-reload')) { loadCrmOrders(true); return; }
  if (t.hasAttribute('data-crm-savenote')) { const v = $('#crm-note').value.slice(0, 3000); upd(open, (m) => { m.n = v; }); return; }
  if (t.hasAttribute('data-crm-radd')) {
    const d = $('#crm-rd').value, x = $('#crm-rx').value.trim().slice(0, 300);
    if (!/^\d{4}-\d\d-\d\d$/.test(d) || !x) { toast('Вкажіть дату й текст нагадування'); return; }
    upd(open, (m) => { m.r.push({ id: Date.now().toString(36), d, x, done: false }); }); return;
  }
  if (t.hasAttribute('data-crm-done')) { const [k, id] = t.getAttribute('data-crm-done').split('|'); upd(k, (m) => { const r = m.r.find((y) => y.id === id); if (r) r.done = true; m.r = m.r.filter((y) => !y.done).concat(m.r.filter((y) => y.done).slice(-10)); }); return; }
  if (t.hasAttribute('data-crm-rdel')) { const id = t.getAttribute('data-crm-rdel'); if (!confirm('Видалити нагадування?')) return; upd(open, (m) => { m.r = m.r.filter((y) => y.id !== id); }); return; }
  if (t.hasAttribute('data-crm-ord')) {
    const id = t.getAttribute('data-crm-ord'); location.hash = '#orders';
    setTimeout(() => { const i = document.getElementById('ord-q'); if (i) { i.value = id; i.dispatchEvent(new Event('input', { bubbles: true })); } }, 250);
  }
}
function onInput(e) { const t = e.target; if (t.id === 'crm-q') { q = t.value; renderCrm(); } }
function onChange(e) {
  const t = e.target;
  if (t.id === 'crm-sort') { sort = t.value; renderCrm(); }
  else if (t.id === 'crm-ch') { fch = t.value; renderCrm(); }
  else if (t.id === 'crm-tagf') { ftag = t.value; renderCrm(); }
  else if (t.id === 'crm-x') { fx = t.value; renderCrm(); }
  else if (t.hasAttribute('data-crm-tag')) { const x = t.getAttribute('data-crm-tag'), on = t.checked; upd(open, (m) => { m.t = m.t.filter((y) => y !== x); if (on) m.t.push(x); }); }
  else if (t.id === 'crm-newtag') { const x = t.value.trim().slice(0, 30); if (x) upd(open, (m) => { if (!m.t.includes(x)) m.t.push(x); }); }
}
