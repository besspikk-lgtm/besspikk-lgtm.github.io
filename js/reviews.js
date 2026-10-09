/* Alex_bes — відгуки й оцінки товарів (09.10.2026, версія 2 — без нових правил Firestore).
   Показ: data/reviews.json (статичний файл у репозиторії сайту; туди відгук дописує бот @AlexBes_order_bot після «Опублікувати»).
   Надсилання: документ orders/<20 символів> у Firestore REST — та сама схема, яку вже дозволяють чинні правила для замовлень
   (v = 1, items — JSON-рядок, name, note, text, createdAt = серверний час). Ознака відгуку: text починається з «Відгук на товар»,
   items = [{"review":1,"pid","pname","rating"}]. Бот бачить його через наявне сповіщення про orders/* і надсилає Alex
   повідомлення з кнопками «Опублікувати» / «Видалити». Firebase SDK тут не потрібен.
   Працює в картці товару (index.html, через window.AlexBesUX.on('product')) і на p/<id>/ (секція [data-rv-pid]).
   Рейтинг і JSON-LD aggregateRating — лише зі схвалених відгуків з reviews.json; немає відгуків — немає рейтингу. */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const FS = 'https://firestore.googleapis.com/v1/projects/alexbes-shop/databases/(default)/documents';
const FS_KEY = 'AIzaSyD5_dbpCMwmr7eu026qfqblotw1vTDkQW4'; // публічний web API key сайту (той самий, що в js/fb-common.js)
const REVIEW_MARK = 'Відгук на товар';
const JSON_URL = new URL('../data/reviews.json', import.meta.url).href;

const MIN_TXT = 10, MAX_TXT = 1000, MIN_NAME = 2, MAX_NAME = 60, PAGE = 5, MAX_LOAD = 200;
const RL_KEY = 'alexbes_rv', DAY = 864e5, GAP = 60e3, PER_DAY = 3, MIN_FILL = 4000;
const SITE = 'https://alexbes.com.ua/';
const WORDS = ['', 'Погано', 'Так собі', 'Нормально', 'Добре', 'Відмінно'];
const $ = (s, r) => (r || document).querySelector(s);
const STAR = 'M12 2.6l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z';
const svgStar = (n, cls) => '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" width="' + n + '" height="' + n + '" aria-hidden="true" focusable="false"><path d="' + STAR + '"/></svg>';
const svgI = (d, n) => '<svg viewBox="0 0 24 24" width="' + (n || 18) + '" height="' + (n || 18) + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + d + '</svg>';
const I_MSG = '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12Z"/><path d="M8.5 10.5h7M8.5 13.5h4.5"/>';
const I_OK = '<circle cx="12" cy="12" r="9"/><path d="m8 12.4 2.7 2.6L16 9.6"/>';
const I_SEND = '<path d="M21 3 10.5 13.5"/><path d="M21 3 14.5 21l-4-7.5L3 9.5Z"/>';

const num1 = (x) => x.toFixed(1).replace('.', ',');
function plural(n, a, b, c) { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? b : c; }
const cntTxt = (n) => n + ' ' + plural(n, 'відгук', 'відгуки', 'відгуків');
const dfmt = new Intl.DateTimeFormat('uk-UA', { timeZone: 'Europe/Kyiv', day: 'numeric', month: 'long', year: 'numeric' });
function tsMs(t) { if (!t) return 0; if (typeof t === 'number') return t; if (t.toMillis) return t.toMillis(); if (t.seconds) return t.seconds * 1000; return 0; }
const fmtDate = (t) => { const m = tsMs(t); return m ? dfmt.format(new Date(m)).replace(/\s*р\.$/, '') : ''; };

// зірки середньої оцінки: сірий ряд + жовтий ряд, обрізаний до avg/5
function starsHTML(avg, n, label) {
  const row = (c) => '<span class="rvs__row ' + c + '">' + svgStar(n) + svgStar(n) + svgStar(n) + svgStar(n) + svgStar(n) + '</span>';
  return '<span class="rvs" role="img" aria-label="' + esc(label || ('Оцінка ' + num1(avg) + ' з 5')) + '">' + row('rvs__bg') +
    '<span class="rvs__fg" style="width:' + Math.max(0, Math.min(100, avg / 5 * 100)).toFixed(1) + '%">' + row('') + '</span></span>';
}
function summary(list) {
  const n = list.length; if (!n) return null;
  const s = list.reduce((a, r) => a + r.rating, 0);
  const dist = [0, 0, 0, 0, 0, 0]; list.forEach((r) => { dist[r.rating]++; });
  return { n, avg: Math.round(s / n * 10) / 10, dist };
}

/* ---------- дані: data/reviews.json ---------- */
const MOCK = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && window.__ALEXBES_RV_MOCK ? window.__ALEXBES_RV_MOCK : null; // лише локальне прев'ю
const cache = {}; // productId -> { list, err }
let allP = null;
function clean(d) {
  const r = Number(d && d.rating);
  if (!d || !(r >= 1 && r <= 5) || typeof d.text !== 'string' || typeof d.name !== 'string' || typeof d.productId !== 'string') return null;
  const t = Date.parse(d.date || '') || 0;
  return { id: String(d.id || ''), pid: d.productId, name: d.name, text: d.text, rating: Math.round(r), t };
}
function loadAll() {
  if (allP) return allP;
  allP = (async () => {
    let arr;
    if (MOCK) arr = MOCK.reviews || [];
    else {
      // кеш-бастинг: нове значення раз на хвилину (GitHub Pages і так кешує ≤ 10 хв)
      const r = await fetch(JSON_URL + '?t=' + Math.floor(Date.now() / 60000), { cache: 'no-cache' });
      if (r.status === 404) return { by: {}, err: false };
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json(); arr = Array.isArray(j) ? j : (j && Array.isArray(j.reviews) ? j.reviews : []);
    }
    const by = {};
    arr.map(clean).filter(Boolean).forEach((x) => { (by[x.pid] = by[x.pid] || []).push(x); });
    Object.keys(by).forEach((k) => by[k].sort((a, b) => b.t - a.t));
    return { by, err: false };
  })().catch(() => ({ by: {}, err: true }));
  return allP;
}
function load(pid) {
  return loadAll().then((a) => { cache[pid] = { list: a.by[pid] || [], err: a.err }; return cache[pid]; });
}

/* ---------- захист від спаму: перевірки + обмеження частоти (localStorage) ---------- */
function rlGet() { try { const o = JSON.parse(localStorage.getItem(RL_KEY) || '{}'); return { t: Array.isArray(o.t) ? o.t : [], p: o.p && typeof o.p === 'object' ? o.p : {} }; } catch (e) { return { t: [], p: {} }; } }
function rlSave(o) { try { localStorage.setItem(RL_KEY, JSON.stringify(o)); } catch (e) {} }
function rlCheck(pid) {
  const o = rlGet(), now = Date.now(), last = o.t.length ? Math.max.apply(null, o.t) : 0;
  if (o.p[pid] && now - o.p[pid] < DAY) return 'Ви вже залишили відгук на цей товар. Він з’явиться після перевірки.';
  if (now - last < GAP) return 'Зачекайте хвилину перед наступним відгуком.';
  if (o.t.filter((x) => now - x < DAY).length >= PER_DAY) return 'Забагато відгуків з цього пристрою за добу. Спробуйте завтра.';
  return '';
}
function rlMark(pid) { const o = rlGet(), now = Date.now(); o.t = o.t.filter((x) => now - x < DAY).concat(now); o.p[pid] = now; Object.keys(o.p).forEach((k) => { if (now - o.p[k] > 30 * DAY) delete o.p[k]; }); rlSave(o); }
const sentTo = (pid) => { const o = rlGet(); return !!(o.p[pid] && Date.now() - o.p[pid] < DAY); };

/* ---------- розмітка ---------- */
const st = {}; // productId -> { show, rating, name, text, t0, msg, ok, sent, open }
const S = (pid) => (st[pid] = st[pid] || { show: PAGE, rating: 0, name: '', text: '', t0: 0, msg: '', ok: false, sent: false, open: false });

function badgeHTML(sum, href) {
  if (!sum) return '';
  return '<a class="rvb" href="' + href + '" data-rv-jump>' + starsHTML(sum.avg, 15) + '<b>' + num1(sum.avg) + '</b><span>' + cntTxt(sum.n) + '</span></a>';
}
function itemHTML(r) {
  return '<li class="rv__it"><div class="rv__ih"><b class="rv__nm">' + esc(r.name) + '</b>' + starsHTML(r.rating, 14, 'Оцінка ' + r.rating + ' з 5') +
    (r.t ? '<time class="rv__dt" datetime="' + new Date(r.t).toISOString().slice(0, 10) + '">' + esc(fmtDate(r.t)) + '</time>' : '') + '</div>' +
    '<p class="rv__tx">' + esc(r.text).replace(/\n{2,}/g, '\n').replace(/\n/g, '<br>') + '</p></li>';
}
function formHTML(pid) {
  const s = S(pid);
  if (s.sent || sentTo(pid)) {
    return '<div class="rvf rvf--done" role="status">' + svgI(I_OK, 22) + '<div><b>Дякуємо за відгук!</b><span>Він з’явиться на сайті, щойно Alex_bes його перевірить.</span></div></div>';
  }
  if (!s.open) return '<button class="btn btn--o btn--full rv__open" type="button" data-rv-open>' + svgI(I_MSG, 18) + '<span>Залишити відгук</span></button>';
  const stars = [1, 2, 3, 4, 5].map((i) => '<button type="button" class="rvf__st' + (i <= s.rating ? ' on' : '') + '" role="radio" aria-checked="' + (i === s.rating) + '" aria-label="' + i + ' з 5 — ' + WORDS[i] + '" data-rv-star="' + i + '"' + (i === (s.rating || 1) ? '' : ' tabindex="-1"') + '>' + svgStar(34) + '</button>').join('');
  return '<form class="rvf" data-rv-form novalidate>' +
    '<p class="rvf__h">Ваш відгук</p>' +
    '<div class="rvf__stars"><div class="rvf__row" role="radiogroup" aria-label="Оцінка товару" aria-required="true">' + stars + '</div><span class="rvf__word" data-rv-word>' + (s.rating ? WORDS[s.rating] : 'Оберіть оцінку') + '</span></div>' +
    '<label class="rvf__f">Ім’я<input name="name" maxlength="' + MAX_NAME + '" autocomplete="name" value="' + esc(s.name) + '" required></label>' +
    '<label class="rvf__f">Відгук<textarea name="text" rows="4" maxlength="' + MAX_TXT + '" placeholder="Що сподобалось, як показав себе в роботі, що варто врахувати" required>' + esc(s.text) + '</textarea>' +
      '<span class="rvf__cnt" data-rv-cnt>' + cntHint(s.text) + '</span></label>' +
    '<label class="rvf__hp" aria-hidden="true">Не заповнюйте це поле<input name="company" tabindex="-1" autocomplete="off"></label>' +
    '<p class="rvf__msg' + (s.ok ? ' ok' : '') + '" role="alert"' + (s.msg ? '' : ' hidden') + '>' + esc(s.msg) + '</p>' +
    '<button class="btn btn--y btn--full" type="submit">' + svgI(I_SEND, 18) + '<span>Надіслати відгук</span></button>' +
    '<p class="rvf__note">Відгук з’явиться після перевірки. Ми не публікуємо телефони, посилання й образи.</p>' +
  '</form>';
}
function cntHint(t) { const n = t.trim().length; return n < MIN_TXT ? 'Ще щонайменше ' + (MIN_TXT - n) + ' ' + plural(MIN_TXT - n, 'символ', 'символи', 'символів') : n + ' / ' + MAX_TXT; }
function distHTML(sum) {
  return '<ul class="rv__dist">' + [5, 4, 3, 2, 1].map((k) => '<li><span>' + k + '</span>' + svgStar(12) + '<i><b style="width:' + (sum.dist[k] / sum.n * 100).toFixed(1) + '%"></b></i><em>' + sum.dist[k] + '</em></li>').join('') + '</ul>';
}
function sectionHTML(pid, c) {
  const s = S(pid), list = c && c.list ? c.list : null, sum = list ? summary(list) : null;
  let head;
  if (!list) head = '<p class="rv__empty muted">Завантаження відгуків…</p>';
  else if (sum) head = '<div class="rv__sum"><div class="rv__avg"><b>' + num1(sum.avg) + '</b>' + starsHTML(sum.avg, 18) + '<span>' + cntTxt(sum.n) + '</span></div>' + distHTML(sum) + '</div>';
  else head = '<p class="rv__empty">' + (c.err ? 'Не вдалося завантажити відгуки. Оновіть сторінку трохи пізніше.' : 'Відгуків ще немає. Купували цей товар? Розкажіть, як він показав себе в роботі.') + '</p>';
  const items = sum ? '<ul class="rv__list">' + list.slice(0, s.show).map(itemHTML).join('') + '</ul>' +
    (list.length > s.show ? '<button class="btn btn--o btn--full rv__more" type="button" data-rv-more>Показати ще ' + Math.min(PAGE, list.length - s.show) + ' з ' + (list.length - s.show) + '</button>' : '') : '';
  return '<h2 class="rv__ttl" id="rv-ttl-' + esc(pid) + '">Відгуки' + (sum ? ' <span>' + sum.n + '</span>' : '') + '</h2>' + head + items + formHTML(pid);
}

/* ---------- місця показу ---------- */
let modalPid = null;
function hosts() { return Array.from(document.querySelectorAll('[data-rv-host]')); }
function paint(pid) {
  hosts().forEach((h) => { if (h.getAttribute('data-rv-host') !== pid) return; h.innerHTML = sectionHTML(pid, cache[pid]); });
  const c = cache[pid], sum = c && c.list ? summary(c.list) : null;
  document.querySelectorAll('[data-rv-badge="' + CSS.escape(pid) + '"]').forEach((b) => { b.innerHTML = badgeHTML(sum, b.getAttribute('data-rv-href') || '#vidguky'); b.hidden = !sum; });
  if (pid === modalPid) ldUpdate(pid, sum, c ? c.list : null);
}

// модальне вікно каталогу: секція перед липкою панеллю, рейтинг під назвою
function onProduct(p) {
  const info = $('#pm .pm__info'); if (!info || !p) return;
  modalPid = p.id; ldProduct = p;
  const h2 = $('#pm-name', info);
  if (h2 && !$('[data-rv-badge]', info)) h2.insertAdjacentHTML('afterend', '<div class="rvb-wrap" data-rv-badge="' + esc(p.id) + '" data-rv-href="#rv-sec" hidden></div>');
  if (!$('[data-rv-host]', info)) {
    const sec = '<section class="rv rv--pm" id="rv-sec" data-rv-host="' + esc(p.id) + '" aria-labelledby="rv-ttl-' + esc(p.id) + '"></section>';
    const bar = $('#pmbar', info); if (bar) bar.insertAdjacentHTML('beforebegin', sec); else info.insertAdjacentHTML('beforeend', sec);
  }
  paint(p.id);
  load(p.id).then(() => { if (modalPid === p.id) paint(p.id); });
}
// статичні сторінки p/<id>/
function initStatic() {
  const sec = $('[data-rv-pid]'); if (!sec) return;
  const pid = sec.getAttribute('data-rv-pid');
  sec.setAttribute('data-rv-host', pid);
  const pr = $('.pp__price') || $('.pp__h1');
  if (pr && !$('[data-rv-badge]')) pr.insertAdjacentHTML('afterend', '<div class="rvb-wrap" data-rv-badge="' + esc(pid) + '" data-rv-href="#vidguky" hidden></div>');
  ldProduct = { id: pid, name: sec.getAttribute('data-rv-name') || pid }; modalPid = pid;
  paint(pid);
  const go = () => load(pid).then(() => paint(pid));
  if (MOCK) { go(); return; }
  const idle = () => (window.requestIdleCallback ? requestIdleCallback(go, { timeout: 2500 }) : setTimeout(go, 1200));
  if (document.readyState === 'complete') idle(); else addEventListener('load', idle, { once: true });
}

/* ---------- JSON-LD (лише модальне вікно, лише справжні схвалені відгуки) ---------- */
let ldProduct = null;
function ldUpdate(pid, sum, list) {
  let el = document.getElementById('rv-ld');
  if (!sum || !ldProduct || ldProduct.id !== pid) { if (el) el.remove(); return; }
  const p = ldProduct, url = SITE + 'p/' + encodeURIComponent(p.id) + '/';
  const ld = { '@context': 'https://schema.org', '@type': 'Product', '@id': url + '#product', name: p.name, url,
    aggregateRating: { '@type': 'AggregateRating', ratingValue: sum.avg, reviewCount: sum.n, bestRating: 5, worstRating: 1 },
    review: list.slice(0, 5).map((r) => ({ '@type': 'Review', author: { '@type': 'Person', name: r.name }, datePublished: r.t ? new Date(r.t).toISOString().slice(0, 10) : undefined,
      reviewBody: r.text, reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5, worstRating: 1 } })) };
  if (p.brand) ld.brand = { '@type': 'Brand', name: p.brand };
  if (!el) { el = document.createElement('script'); el.type = 'application/ld+json'; el.id = 'rv-ld'; document.head.appendChild(el); }
  el.textContent = JSON.stringify(ld);
}
function watchModal() {
  const m = $('#pmodal'); if (!m || !window.MutationObserver) return;
  new MutationObserver(() => { if (m.hidden) { modalPid = null; ldProduct = null; const el = document.getElementById('rv-ld'); if (el) el.remove(); } }).observe(m, { attributes: true, attributeFilter: ['hidden'] });
}

/* ---------- дії ---------- */
const pidOf = (el) => { const h = el.closest('[data-rv-host]'); return h ? h.getAttribute('data-rv-host') : null; };
function setStars(form, pid, v) {
  const s = S(pid); s.rating = v;
  form.querySelectorAll('[data-rv-star]').forEach((b) => { const i = +b.getAttribute('data-rv-star'); b.classList.toggle('on', i <= v); b.setAttribute('aria-checked', String(i === v)); b.tabIndex = i === v ? 0 : -1; });
  const w = form.querySelector('[data-rv-word]'); if (w) w.textContent = WORDS[v];
  if (!s.t0) s.t0 = Date.now();
}
function sayF(form, pid, t, ok) { const s = S(pid); s.msg = t; s.ok = !!ok; const p = form.querySelector('.rvf__msg'); if (p) { p.textContent = t; p.hidden = !t; p.classList.toggle('ok', !!ok); } }
function setName(pid, v) {
  const s = S(pid); if (!v || s.name) return; s.name = String(v).slice(0, MAX_NAME);
  const i = document.querySelector('[data-rv-host="' + CSS.escape(pid) + '"] input[name=name]'); if (i && !i.value) i.value = s.name;
}
// ім’я з профілю / кошика (js/fb.js переносить ім’я з акаунта в дані кошика) — без Firebase
function prefill(pid) {
  if (MOCK) { setName(pid, MOCK.__user); return; }
  let n = '';
  try { const AB = window.AlexBes; if (AB && AB.getForm) n = AB.getForm().name || ''; } catch (e) {}
  if (!n) { try { n = (JSON.parse(localStorage.getItem('alexbes_form') || '{}') || {}).name || ''; } catch (e) {} }
  setName(pid, n);
}
function genId() {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'; let id = '';
  while (id.length < 20) { const b = new Uint8Array(32); crypto.getRandomValues(b); for (let j = 0; j < b.length && id.length < 20; j++) if (b[j] < 248) id += A.charAt(b[j] % 62); }
  return id;
}
// запис orders/<id> за чинними правилами для замовлень (лише створення; прочитати може лише той, хто знає id)
async function sendReview(pid, pname, name, text, rating) {
  const id = genId(), S2 = (v) => ({ stringValue: v });
  const items = JSON.stringify([{ review: 1, pid, pname: pname.slice(0, 300), rating }]);
  const body = { writes: [{ update: { name: FS.split('/v1/')[1] + '/orders/' + id, fields: {
      v: { integerValue: '1' }, items: S2(items), name: S2(name), note: S2(text),
      text: S2((REVIEW_MARK + ': ' + (pname || pid) + ' · ' + rating + '/5').slice(0, 6000)) } },
    currentDocument: { exists: false }, updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }] }] };
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(FS + ':commit?key=' + FS_KEY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
    if (!r.ok) { const e = new Error('HTTP ' + r.status); e.code = r.status === 403 ? 'permission-denied' : 'http'; throw e; }
    return id;
  } finally { clearTimeout(to); }
}
document.addEventListener('click', (e) => {
  const t = e.target.closest && e.target.closest('[data-rv-open],[data-rv-star],[data-rv-more],[data-rv-jump]'); if (!t) return;
  if (t.hasAttribute('data-rv-jump')) {
    const sec = document.querySelector(t.getAttribute('href')); if (!sec) return;
    e.preventDefault(); sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); return;
  }
  const pid = pidOf(t); if (!pid) return;
  if (t.hasAttribute('data-rv-open')) { const s = S(pid); s.open = true; s.t0 = s.t0 || Date.now(); paint(pid); prefill(pid); const f = document.querySelector('[data-rv-host="' + CSS.escape(pid) + '"] [data-rv-star="5"]'); if (f) f.closest('.rvf').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); track(pid, 'відкрито форму'); return; }
  if (t.hasAttribute('data-rv-star')) { setStars(t.closest('form'), pid, +t.getAttribute('data-rv-star')); sayF(t.closest('form'), pid, ''); return; }
  if (t.hasAttribute('data-rv-more')) { S(pid).show += PAGE; paint(pid); }
});
window.addEventListener('keydown', (e) => { // capture: стрілки на зірках не гортають галерею картки
  const t = e.target.closest && e.target.closest('[data-rv-star]'); if (!t) return;
  const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0; if (!d) return;
  e.preventDefault(); e.stopPropagation(); const pid = pidOf(t), form = t.closest('form'), v = Math.max(1, Math.min(5, (S(pid).rating || 0) + d));
  setStars(form, pid, v); const b = form.querySelector('[data-rv-star="' + v + '"]'); if (b) b.focus();
}, true);
document.addEventListener('input', (e) => {
  const f = e.target.closest && e.target.closest('[data-rv-form]'); if (!f) return;
  const pid = pidOf(f), s = S(pid); if (!s.t0) s.t0 = Date.now();
  if (e.target.name === 'name') s.name = e.target.value;
  if (e.target.name === 'text') { s.text = e.target.value; const c = f.querySelector('[data-rv-cnt]'); if (c) c.textContent = cntHint(s.text); }
});
document.addEventListener('submit', async (e) => {
  const f = e.target.closest && e.target.closest('[data-rv-form]'); if (!f) return;
  e.preventDefault();
  const pid = pidOf(f), s = S(pid);
  const name = f.elements.name.value.replace(/\s+/g, ' ').trim(), text = f.elements.text.value.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  s.name = f.elements.name.value; s.text = f.elements.text.value;
  if (f.elements.company && f.elements.company.value) { s.sent = true; paint(pid); return; } // honeypot: робот «успішно» надіслав, у базу нічого не йде
  if (!(s.rating >= 1 && s.rating <= 5)) return sayF(f, pid, 'Оберіть оцінку від 1 до 5 зірок.');
  if (name.length < MIN_NAME) return sayF(f, pid, 'Вкажіть ім’я (щонайменше 2 символи).');
  if (name.length > MAX_NAME) return sayF(f, pid, 'Ім’я задовге (до ' + MAX_NAME + ' символів).');
  if (text.length < MIN_TXT) return sayF(f, pid, 'Відгук закороткий: щонайменше ' + MIN_TXT + ' символів.');
  if (text.length > MAX_TXT) return sayF(f, pid, 'Відгук задовгий: до ' + MAX_TXT + ' символів.');
  if (/(https?:\/\/|www\.|t\.me\/)/i.test(text + ' ' + name)) return sayF(f, pid, 'Будь ласка, без посилань у відгуку.');
  if (s.t0 && Date.now() - s.t0 < MIN_FILL) return sayF(f, pid, 'Зачекайте кілька секунд і надішліть ще раз.');
  const lim = rlCheck(pid); if (lim) return sayF(f, pid, lim);
  const btn = f.querySelector('button[type=submit]'); if (btn) btn.disabled = true;
  sayF(f, pid, 'Надсилаємо…', true);
  try {
    if (!MOCK) {
      const UX = window.AlexBesUX, p = UX && UX.byId ? UX.byId(pid) : null, sec = document.querySelector('[data-rv-pid]');
      const pname = String((p && p.name) || (sec && sec.getAttribute('data-rv-name')) || '');
      await sendReview(pid, pname, name, text, s.rating);
    }
    rlMark(pid); s.sent = true; s.text = ''; s.msg = ''; paint(pid); track(pid, 'надіслано ' + s.rating);
  } catch (err) {
    if (btn) btn.disabled = false;
    sayF(f, pid, /permission/i.test((err && (err.code || err.message)) || '') ? 'Не вдалося надіслати відгук. Перевірте поля й спробуйте ще раз.' : 'Немає зв’язку з сервером. Спробуйте ще раз за хвилину.');
  }
});
function track(pid, what) { try { const UX = window.AlexBesUX; if (UX && UX.track) UX.track('відгук/' + pid, 'Відгук: ' + what); } catch (e) {} }

/* ---------- старт ---------- */
if (window.AlexBesUX && window.AlexBesUX.on) {
  window.AlexBesUX.on('product', onProduct);
  watchModal();
  const p = $('#pmodal'); if (p && !p.hidden && window.AlexBesUX.pmState && window.AlexBesUX.pmState.id) onProduct(window.AlexBesUX.byId(window.AlexBesUX.pmState.id));
}
initStatic();
