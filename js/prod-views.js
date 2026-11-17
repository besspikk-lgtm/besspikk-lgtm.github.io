/* Alex_bes — лічильник переглядів товару на статичних p/<id>/ (17.11.2026).
   Пише в уже дозволену колекцію stats/{день за Києвом} поле p_<id> (ті самі правила, що
   відкриття картки в каталозі). Нової колекції й зміни правил Firestore не потрібно.
   Гості: +1 раз на товар на добу (localStorage alexbes_pv); боти не рахуються.
   Адмін (прапорець alexbes_adm з каталогу / підтверджений вхід): власні перегляди
   не пишемо; на сторінці показуємо discreet бейдж з сумою за останні 365 днів. */
import { loadFirebase, isAdminUser } from './fb-common.js?v=2';

const FS = 'https://firestore.googleapis.com/v1/projects/alexbes-shop/databases/(default)/documents';
const FS_KEY = 'AIzaSyD5_dbpCMwmr7eu026qfqblotw1vTDkQW4';
const PV_KEY = 'alexbes_pv', ADM_KEY = 'alexbes_adm', PV_MAX = 80;
const EYE = '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>';
const skip = (function () {
  try { return !!navigator.webdriver || /bot|crawl|spider|slurp|lighthouse|headless|preview|facebookexternalhit|whatsapp|telegram/i.test(navigator.userAgent || ''); } catch (e) { return true; }
})();

const m = /\/p\/([A-Za-z0-9_-]{1,80})\/?$/.exec(location.pathname || '');
const pid = m && m[1];

function kyivDay() {
  try {
    const o = {}; new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).forEach((x) => { o[x.type] = x.value; });
    if (o.year && o.month && o.day) return o.year + '-' + o.month + '-' + o.day;
  } catch (e) {}
  return new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
}
function pvTaken(id) {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(PV_KEY) || 'null'); } catch (e) {}
  const day = kyivDay();
  if (!s || s.d !== day || !Array.isArray(s.k)) s = { d: day, k: [] };
  if (s.k.indexOf(id) >= 0 || s.k.length >= PV_MAX) return true;
  s.k.push(id);
  try { localStorage.setItem(PV_KEY, JSON.stringify(s)); } catch (e) {}
  return false;
}
function isAdmFlag() {
  try { return localStorage.getItem(ADM_KEY) === '1'; } catch (e) { return false; }
}
function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0'); }
function svgEye() {
  return '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + EYE + '</svg>';
}
function ensureCss() {
  if (document.getElementById('ab-views-css')) return;
  const s = document.createElement('style');
  s.id = 'ab-views-css';
  s.textContent = '.vw{display:inline-flex;align-items:center;gap:4px;padding:3px 8px 3px 6px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:0;line-height:1;color:var(--text2,#d7deea);background:rgba(8,17,31,.72);box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);pointer-events:none;white-space:nowrap;text-transform:none}' +
    '.vw b{font-weight:700}' +
    '.vw--card{position:absolute;left:10px;top:10px;z-index:2;margin:0}' +
    '.prem .vw--card{left:16px;top:16px}' +
    '.vw--pm,.vw--pp{position:static;margin:0;align-self:flex-start;width:max-content;background:rgba(255,255,255,.04);box-shadow:inset 0 0 0 1px var(--line2,rgba(255,255,255,.14));color:var(--muted,#9aa6b8)}' +
    '.vw--pm b,.vw--pp b{color:var(--text2,#d7deea)}' +
    '@media (max-width:760px){.vw{font-size:10.5px;padding:3px 7px 3px 5px}.prem .vw--card{left:12px;top:12px}}';
  document.head.appendChild(s);
}
function badgeHTML(n, cls) {
  return '<span class="vw ' + cls + '" title="Перегляди картки товару (видно лише вам)" aria-label="Переглядів: ' + n + '">' + svgEye() + '<b>' + fmt(n) + '</b></span>';
}
function showBadge(n) {
  if (!pid) return;
  ensureCss();
  const host = document.querySelector('.pp__info') || document.querySelector('.pp__h1') && document.querySelector('.pp__h1').parentNode;
  if (!host) return;
  const html = badgeHTML(n, 'vw--pp');
  const old = host.querySelector('.vw');
  if (old) { old.outerHTML = html; return; }
  const h1 = host.querySelector('.pp__h1');
  if (h1) h1.insertAdjacentHTML('afterend', html);
  else host.insertAdjacentHTML('afterbegin', html);
}
function hideBadge() {
  document.querySelectorAll('.pp__info .vw, .pp__h1 + .vw').forEach((el) => el.remove());
}

async function pingRest(id) {
  if (skip) return;
  try { if (localStorage.getItem('alexbes_nostats') === '1') return; } catch (e) {}
  if (pvTaken(id)) return;
  const day = kyivDay(), field = 'p_' + id;
  const name = 'projects/alexbes-shop/databases/(default)/documents/stats/' + day;
  try {
    await fetch(FS + ':commit?key=' + FS_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        writes: [{
          update: { name: name, fields: { k: { stringValue: field } } },
          updateMask: { fieldPaths: ['k'] },
          updateTransforms: [{ fieldPath: '`' + field + '`', increment: { integerValue: '1' } }]
        }]
      })
    });
  } catch (e) {}
}

async function loadCounts(F, db) {
  const t = kyivDay();
  const base = Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10));
  const from = new Date(base - 364 * 864e5).toISOString().slice(0, 10);
  const qs = await F.getDocs(F.query(F.collection(db, 'stats'), F.where(F.documentId(), '>=', from)));
  const counts = {};
  qs.forEach((d) => {
    const x = d.data() || {};
    Object.keys(x).forEach((k) => {
      if (k.indexOf('p_') === 0 && typeof x[k] === 'number' && isFinite(x[k])) counts[k.slice(2)] = (counts[k.slice(2)] || 0) + x[k];
    });
  });
  return counts;
}

async function asAdmin() {
  try {
    const { auth, db, A, F } = await loadFirebase();
    const u = await new Promise((res) => {
      const un = A.onAuthStateChanged(auth, (user) => { un(); res(user); });
    });
    if (!isAdminUser(u)) {
      try { localStorage.removeItem(ADM_KEY); } catch (e) {}
      return false;
    }
    try { localStorage.setItem(ADM_KEY, '1'); } catch (e) {}
    showBadge(0);
    try {
      const c = await loadCounts(F, db);
      showBadge(c[pid] || 0);
    } catch (e) {}
    return true;
  } catch (e) { return false; }
}

async function init() {
  if (!pid) return;
  if (isAdmFlag()) {
    const ok = await asAdmin();
    if (ok) return;
  }
  pingRest(pid);
}

window.AlexBesViews = {
  show: function (n) { if (pid) showBadge(typeof n === 'number' ? n : 0); },
  hide: hideBadge
};

init();
