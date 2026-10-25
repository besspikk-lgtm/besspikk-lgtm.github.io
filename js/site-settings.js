/* 22.10.2026: налаштування сайту з адмінки («Налаштування»). Службовий запис products/_site (hidden:true, JSON у description —
   поля дозволені чинними правилами Firestore). Порожнє поле = як зараз у коді сайту (нічого не ламається, якщо не задано). */
(function () {
  var KEY = 'alexbes_site', URL = 'https://firestore.googleapis.com/v1/projects/alexbes-shop/databases/(default)/documents/products/_site';
  var DEF = { phone: '+380995264262', tg: 'alex_bespik', channel: 'alex_bes_shoping', bot: 'AlexBes_order_bot', tiktok: 'alex_bespik', insta: 'alex_bespik',
    consult: 'Добрий день! Потрібна консультація щодо: ' };
  var S = {};
  try { S = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { S = {}; }
  window.ALEXBES_SITE = S;
  if (S.gc === false) window.goatcounter = { no_onload: true };
  var v = function (k) { var x = S[k]; return typeof x === 'string' ? x.trim() : ''; };
  var digits = function (p) { return String(p || '').replace(/[^\d]/g, ''); };
  var label = function (p) { var d = digits(p); if (d.length === 12 && d.indexOf('380') === 0) d = '0' + d.slice(3); return d.length === 10 ? d.replace(/^(\d{3})(\d{3})(\d{2})(\d{2})$/, '$1 $2 $3 $4') : p; };
  function setTxt(el, t) {
    if (!el) return;
    var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null), n, last = null;
    while ((n = w.nextNode())) if (n.nodeValue.trim()) last = n;
    if (last) last.nodeValue = (last.nodeValue.match(/^\s*/)[0]) + t; else el.appendChild(document.createTextNode(t));
  }
  function txt(sel, k) { var t = v(k); if (t) Array.prototype.forEach.call(document.querySelectorAll(sel), function (e) { setTxt(e, t); }); }
  function swapIn(a, from, to) {
    var w = document.createTreeWalker(a, NodeFilter.SHOW_TEXT, null), n;
    while ((n = w.nextNode())) if (n.nodeValue.indexOf(from) >= 0) n.nodeValue = n.nodeValue.split(from).join(to);
    var al = a.getAttribute('aria-label'); if (al && al.indexOf(from) >= 0) a.setAttribute('aria-label', al.split(from).join(to));
  }
  function contacts() {
    var ph = digits(v('phone')), tg = v('tg').replace(/^@/, ''), ch = v('channel').replace(/^@/, ''), bot = v('bot').replace(/^@/, ''),
      tt = v('tiktok').replace(/^@/, ''), ig = v('insta').replace(/^@/, ''), cs = v('consult');
    var oldD = digits(DEF.phone), oldL = label(DEF.phone);
    Array.prototype.forEach.call(document.querySelectorAll('a[href]'), function (a) {
      var h = a.getAttribute('href'), o = h;
      if (ph && h.indexOf(oldD) >= 0 && /^(tel:|https:\/\/wa\.me|viber:)/.test(h)) { h = h.split(oldD).join(ph); swapIn(a, oldL, label('+' + ph)); swapIn(a, '+' + oldD, '+' + ph); }
      if (tg && /^https:\/\/t\.me\/alex_bespik\b/i.test(h)) { h = h.replace(/alex_bespik/i, tg); swapIn(a, '@' + DEF.tg, '@' + tg); }
      if (cs && /^https:\/\/t\.me\/[^?]+\?text=/.test(h)) {
        var m = h.match(/\?text=(.*)$/), q = ''; try { q = decodeURIComponent(m[1]); } catch (e) {}
        if (q.indexOf(DEF.consult) === 0) h = h.replace(/\?text=.*$/, '?text=' + encodeURIComponent(cs.replace(/\s*$/, ' ') + q.slice(DEF.consult.length)));
      }
      if (ch && /t\.me\/alex_bes_shoping/i.test(h)) { h = h.replace(/alex_bes_shoping/i, ch); swapIn(a, DEF.channel, ch); }
      if (bot && /t\.me\/AlexBes_order_bot/i.test(h)) h = h.replace(/AlexBes_order_bot/i, bot);
      if (tt && /tiktok\.com\/@alex_bespik/i.test(h)) { h = h.replace(/@alex_bespik/i, '@' + tt); swapIn(a, '@' + DEF.tiktok, '@' + tt); }
      if (ig && /instagram\.com\/alex_bespik/i.test(h)) { h = h.replace(/alex_bespik/i, ig); swapIn(a, '@' + DEF.insta, '@' + ig); }
      if (h !== o) a.setAttribute('href', h);
    });
  }
  var HIDE = { show_tg: '.tgpromo', show_cta: '.ctabar', show_bnr: '#bnr', show_cats: '#cattiles', show_tips: '.tips', show_recent: '#recent',
    show_how: '#how', show_moti: '.moti', show_seo: 'section.seo', show_radio: '#radio,.tab--radio', show_ua: '.ftr__ua', show_pop: '.ftr__col:has(a[href="palinal/"]),.ftr__col:has(a[href="/palinal/"])' };
  function apply() {
    var css = '';
    Object.keys(HIDE).forEach(function (k) { if (S[k] === false) css += HIDE[k] + '{display:none!important}'; });
    if (/^#[0-9a-f]{6}$/i.test(v('c_accent'))) css += ':root{--yellow:' + v('c_accent') + ';--yellow2:' + v('c_accent') + '}';
    if (/^#[0-9a-f]{6}$/i.test(v('c_bg'))) css += ':root{--bg:' + v('c_bg') + '}body{background:' + v('c_bg') + '}';
    var st = document.getElementById('site-set-css'); if (!st) { st = document.createElement('style'); st.id = 'site-set-css'; document.head.appendChild(st); }
    st.textContent = css;
    var nb = document.getElementById('site-notice');
    if (v('notice') && S.show_notice !== false) {
      if (!nb) { nb = document.createElement('div'); nb.id = 'site-notice'; nb.setAttribute('role', 'note');
        nb.style.cssText = 'background:var(--yellow);color:#062457;text-align:center;font-weight:700;padding:8px 14px;font-size:14px;line-height:1.35';
        document.body.insertBefore(nb, document.body.firstChild); }
      nb.textContent = v('notice');
    } else if (nb) nb.remove();
    txt('.tgpromo__txt b', 'tg_title'); txt('.tgpromo__sub', 'tg_sub'); txt('.tgpromo__go', 'tg_btn');
    txt('.brand__sub', 'brand_sub'); txt('.ftr__about .ftr__line:not(.muted)', 'brand_sub');
    if (v('search_ph')) { var q = document.getElementById('q'); if (q) q.setAttribute('placeholder', v('search_ph')); }
    txt('.hero__btn', 'hero_btn'); txt('#cattiles-ttl', 'cats_title'); txt('#tips-ttl', 'tips_title'); txt('#how > h2', 'how_title');
    [1, 2, 3, 4].forEach(function (i) { txt('#how .steps li:nth-child(' + i + ') > b', 'step' + i + 't'); txt('#how .steps li:nth-child(' + i + ') > span', 'step' + i + 'd'); });
    txt('.moti h3', 'moti_title'); txt('.moti p:nth-of-type(1)', 'moti1'); txt('.moti p:nth-of-type(2)', 'moti2'); txt('.moti__sign', 'moti_sign');
    txt('.ftr__about .ftr__line.muted', 'ftr_about'); txt('#seo-ttl', 'seo_h2');
    if (v('ftr_note')) { var u = document.querySelector('.ftr__bottom .muted.small'); if (u && u.lastChild && u.lastChild.nodeType === 3) u.lastChild.nodeValue = '. ' + v('ftr_note').replace(/^\.\s*/, ''); }
    var home = /^\/(index\.html)?$/.test(location.pathname);
    if (home && v('home_title')) document.title = v('home_title');
    if (home && v('home_desc')) { var md = document.querySelector('meta[name="description"]'); if (md) md.setAttribute('content', v('home_desc')); }
    contacts();
  }
  function run() { try { apply(); } catch (e) {} }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
  try {
    fetch(URL, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : (r.status === 404 ? {} : null); }).then(function (j) {
      if (!j) return;
      var n = {}; try { n = JSON.parse((j.fields && j.fields.description && j.fields.description.stringValue) || '{}') || {}; } catch (e) { n = {}; }
      var was = JSON.stringify(S); localStorage.setItem(KEY, JSON.stringify(n));
      if (JSON.stringify(n) === was) return;
      if (performance.now() < 6000) location.reload(); else { S = n; window.ALEXBES_SITE = n; run(); }
    }).catch(function () {});
  } catch (e) {}
})();
