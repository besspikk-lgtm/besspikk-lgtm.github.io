/* Sync a static p/<id>/ page with the public Firestore product override (admin edits). */
(function () {
  var PID = (document.querySelector('[data-rv-pid]') || {}).getAttribute && document.querySelector('[data-rv-pid]').getAttribute('data-rv-pid');
  if (!PID || !/^[\w-]{1,80}$/.test(PID)) return;
  var FS = 'https://firestore.googleapis.com/v1/projects/alexbes-shop/databases/(default)/documents/products/' + encodeURIComponent(PID);
  var KEY = 'AIzaSyD5_dbpCMwmr7eu026qfqblotw1vTDkQW4';
  var RATE = 52;
  var GEM = '<span class="promo__gem" aria-hidden="true"><span class="promo__gem-glow"></span><span class="promo__gem-in"><svg viewBox="0 0 24 20" width="24" height="20" focusable="false"><path d="M6 1h12l-3 6H9z" fill="#f2feff"/><path d="M6 1 0 7h9z" fill="#c4f4ff"/><path d="M18 1l6 6h-9z" fill="#9fe9ff"/><path d="M0 7h9l3 12z" fill="#6fd8f7"/><path d="M9 7h6l-3 12z" fill="#dffaff"/><path d="M15 7h9L12 19z" fill="#43bfe8"/><path d="M6 1h12l6 6-12 12L0 7z" fill="none" stroke="#ffffff" stroke-opacity=".75" stroke-width=".7" stroke-linejoin="round"/></svg></span></span>';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]); }); }
  function field(f) {
    if (!f) return undefined;
    if ('stringValue' in f) return f.stringValue;
    if ('integerValue' in f) return Number(f.integerValue);
    if ('doubleValue' in f) return f.doubleValue;
    if ('nullValue' in f) return null;
    if ('booleanValue' in f) return f.booleanValue;
    return undefined;
  }
  function toUah(e) { return Math.round(Number(e) * RATE); }
  function uah(e) { return String(toUah(e)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') + '\u00a0грн'; }
  function promoHTML(t) {
    if (!t) return '';
    var x = String(t);
    if (/ексклюзив/i.test(x) && !/новинк|акці|хіт|гаряч/i.test(x)) return '<span class="promo promo--excl" aria-label="Ексклюзив"><span class="promo__xt">Ексклюзив</span>' + GEM + '</span>';
    if (/новинк/i.test(x) && !/ексклюзив/i.test(x)) return '<span class="promo promo--new">' + esc(x) + '</span>';
    if (/ексклюзив/i.test(x)) return '<span class="promo promo--excl" aria-label="Ексклюзив"><span class="promo__xt">Ексклюзив</span>' + GEM + '</span>';
    return '<span class="promo">' + esc(x) + '</span>';
  }
  function setName(name) {
    if (!name) return;
    var h1 = document.querySelector('.pp__h1'); if (h1) h1.textContent = name;
    var crumb = document.querySelector('.pp__crumbs [aria-current="page"]'); if (crumb) crumb.textContent = name;
    var bar = document.querySelector('.ppbar__txt b'); if (bar) bar.textContent = name;
    var rv = document.querySelector('[data-rv-name]'); if (rv) rv.setAttribute('data-rv-name', name);
    var img = document.querySelector('.pp__ph--main img'); if (img) img.setAttribute('alt', name);
    document.title = name + ' | Alex_bes';
    document.querySelectorAll('script[type="application/ld+json"]').forEach(function (s) {
      try {
        var d = JSON.parse(s.textContent);
        if (d && d['@type'] === 'Product') { d.name = name; s.textContent = JSON.stringify(d); }
      } catch (e) {}
    });
  }
  function setPrice(eur) {
    if (eur == null || !isFinite(Number(eur))) return;
    var txt = uah(eur);
    var el = document.querySelector('.pp__price'); if (el) el.textContent = txt;
    var bar = document.querySelector('.ppbar__txt span'); if (bar) bar.textContent = txt;
    document.querySelectorAll('script[type="application/ld+json"]').forEach(function (s) {
      try {
        var d = JSON.parse(s.textContent);
        if (d && d['@type'] === 'Product') {
          d.offers = { '@type': 'Offer', priceCurrency: 'UAH', price: toUah(eur), url: d.url, seller: { '@type': 'Organization', name: 'Alex_bes', '@id': 'https://alexbes.com.ua/#store', url: 'https://alexbes.com.ua/' }, itemCondition: 'https://schema.org/NewCondition' };
          s.textContent = JSON.stringify(d);
        }
      } catch (e) {}
    });
  }
  function setPromo(t) {
    var html = promoHTML(t);
    var fig = document.querySelector('.pp__ph--main');
    if (!fig) return;
    var old = fig.querySelector('.promo');
    if (!html) { if (old) old.remove(); return; }
    if (old) old.outerHTML = html; else fig.insertAdjacentHTML('beforeend', html);
  }
  function setStock(s) {
    if (!s) return;
    var el = document.querySelector('.pp__stock');
    if (el) {
      var low = String(s).toLowerCase();
      el.className = 'pp__stock pp__stock--' + (low.indexOf('в наявності') === 0 ? 'ok' : (low.indexOf('немає') === 0 ? 'no' : 'ask'));
      var dot = el.querySelector('.pp__dot');
      el.innerHTML = (dot ? '<span class="pp__dot" aria-hidden="true"></span>' : '') + esc(s);
    }
  }
  fetch(FS + '?key=' + KEY, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (doc) {
    if (!doc || !doc.fields) return;
    var f = doc.fields;
    setName(field(f.name));
    setPromo(field(f.promo));
    if (f.price_eur) setPrice(field(f.price_eur));
    setStock(field(f.in_stock));
  }).catch(function () {});
})();
