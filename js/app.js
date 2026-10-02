/* Alex_bes😈 catalog — vanilla JS, no build step. Works from file:// and any static host. */
(function () {
  'use strict';
  var CONFIG = {
    orderTelegram: 'https://t.me/alex_bespik', // особистий Telegram для замовлень
    orderBot: 'https://t.me/AlexBes_order_bot',
    whatsapp: 'https://wa.me/380995264262',
    viber: 'viber://chat?number=%2B380995264262',
    instagram: 'https://ig.me/m/alex_bespik',
    phone: '+380995264262', phoneLabel: '099 526 42 62',
    siteName: 'Alex_bes😈',
    homeTitle: 'Купити фарбопульт Meiji, SATA, Palinal — Чернівці, Україна | Alex_bes😈',
    uahRate: 52 // фіксований курс: ціни зберігаються в € (price_eur), на сайті показуються в гривнях = € × uahRate
  };
  var DATA = window.ALEXBES_DATA || { categories: [], products: [] };
  var PRODUCTS = DATA.products, CATS = DATA.categories;
  var byId = {}; PRODUCTS.forEach(function (p) { byId[p.id] = p; });
  var catById = {}; CATS.forEach(function (c) { catById[c.id] = c; });

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  /* ---------- prices: € (stored) -> гривні (shown) ---------- */
  function toUah(e) { return Math.round(Number(e) * CONFIG.uahRate); } // ціла гривня
  function fmtUah(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' грн'; } // 21840 -> "21 840 грн"
  var uahTxt = function (e) { return fmtUah(toUah(e)); }; // plain text (order message)
  var uah = function (e) { return uahTxt(e).replace(/ /g, '\u00a0'); }; // HTML: no line break inside the price
  // free text from data/admin (description, price_label, variant labels, price_note): "420 €", "+25 €", "19,3€" -> гривні;
  // drop leftover "у €" / "в €" wording ("Прайс Palinal у € (пост 147)" -> "Прайс Palinal (пост 147)")
  var EUR_NUM = /(\d{1,3}(?:[ \u00a0\u202f]\d{3})+|\d+)(?:[.,](\d+))?\s?€/g;
  function uahText(s) {
    if (s == null) return s;
    s = String(s);
    if (s.indexOf('€') < 0) return s;
    s = s.replace(/(\d[\d.,]*)\s?€\s*·\s*[\d\s.,]+\s?\$\s*·\s*(?=[\d\s]+грн)/g, ''); // "308€ · 360$ · 16 000 грн" -> keep the original грн
    s = s.replace(EUR_NUM, function (m, a, b) { return fmtUah(toUah(parseFloat(a.replace(/[ \u00a0\u202f]/g, '') + (b ? '.' + b : '')))).replace(/ /g, '\u00a0'); });
    s = s.replace(/\s+[ув]\s+€(?:\s*\(по курсу НБУ\))?/g, '').replace(/\s*€/g, ' грн');
    return s;
  }

  var state = { cat: 'all', q: '', sort: 'def' };
  var lastListHash = '#/';

  /* ---------- storage ---------- */
  var mem = {};
  function load(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return mem[k] || d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { mem[k] = v; } }
  // cart lines whose product is unknown right now (e.g. added via admin and not loaded yet, or hidden) are kept aside in `orphans`
  // so they survive in storage/account and reappear once the product data arrives.
  var cart = [], orphans = [];
  function cleanLines(arr) {
    var out = [];
    (Array.isArray(arr) ? arr : []).forEach(function (l) {
      if (!l || typeof l.id !== 'string') return;
      var vi = Math.max(0, parseInt(l.vi, 10) || 0), qty = Math.max(1, Math.min(9999, parseInt(l.qty, 10) || 1));
      var ex = out.filter(function (x) { return x.id === l.id && x.vi === vi; })[0];
      if (ex) ex.qty += qty; else out.push({ id: l.id, vi: vi, qty: qty });
    });
    return out;
  }
  function splitCart(arr) {
    cart = []; orphans = [];
    cleanLines(arr).forEach(function (l) { (byId[l.id] ? cart : orphans).push(l); });
  }
  splitCart(load('alexbes_cart', []));
  var form = load('alexbes_form', {});
  var cartListeners = [];
  function allLines() { return cart.concat(orphans).map(function (l) { return { id: l.id, vi: l.vi, qty: l.qty }; }); }
  function saveCart(silent) {
    save('alexbes_cart', allLines());
    if (!silent) cartListeners.forEach(function (fn) { try { fn(allLines()); } catch (e) {} });
  }

  /* ---------- price helpers ---------- */
  function hasPrice(p) { return p.price_eur != null; }
  function variantOf(p, vi) { return p.variants && p.variants[vi] ? p.variants[vi] : null; }
  function unitPrice(p, vi) { var v = variantOf(p, vi); return v ? v.price_eur : p.price_eur; }
  function unitLabel(p, vi) { var v = variantOf(p, vi); return v ? v.label : (p.price_label || ''); }
  function pillHTML(p) {
    if (!hasPrice(p)) return '<span class="pill pill--ask">Ціну уточнюйте</span>';
    var from = p.variants && p.variants.length > 1 ? '<small>від</small>' : '';
    return '<span class="pill">' + from + uah(p.price_eur) + '</span>';
  }
  var PLACEHOLDER = 'img/logo.webp?v=3';
  var photoData = {}; // id -> data URL loaded from Firestore photos/{id}
  // gallery: ordered photo keys from Firestore — 'static' = catalog photo (img/p), 'main' = photos/{id}, other = photos/{id}__{key}
  function galleryOf(p) {
    var g = Array.isArray(p.gallery) ? p.gallery : (p.hasPhoto ? ['main'] : (p.photo ? ['static'] : []));
    var out = [];
    g.forEach(function (k) {
      if (typeof k !== 'string' || out.length >= 10) return;
      if (k === 'static') { var st = BASE[p.id] ? BASE[p.id].photo : p.photo; if (st) out.push({ src: st }); }
      else if (/^[\w-]{1,40}$/.test(k)) out.push({ doc: k === 'main' ? p.id : p.id + '__' + k });
    });
    return out;
  }
  function imgAttrs(p, g) {
    if (!g) return 'src="' + PLACEHOLDER + '"';
    if (g.src) return 'src="' + esc(g.src) + '"';
    return photoData[g.doc] ? 'src="' + photoData[g.doc] + '"' : 'src="' + (p.photo || PLACEHOLDER) + '" data-ph="' + esc(g.doc) + '"';
  }
  function mainImg(p) { return imgAttrs(p, galleryOf(p)[0]); }
  function stockHTML(p) {
    var s = p.in_stock || '';
    var cls = /немає/i.test(s) ? ' stock--out' : /наявн/i.test(s) && !/уточн/i.test(s) ? '' : /дороз|замовл/i.test(s) ? ' stock--way' : ' stock--ask';
    return '<span class="stock' + cls + '">' + esc(s) + '</span>';
  }

  /* ---------- catalog render ---------- */
  function renderCats() {
    var total = PRODUCTS.length;
    var items = [{ id: 'all', name: 'Усі товари', count: total, icon: '😈' }, { id: 'sale', name: '🔥 Акції', count: PRODUCTS.filter(isSale).length }, { id: 'new', name: '✅ Новинки', count: PRODUCTS.filter(isNew).length }].concat(CATS);
    $('#catlist').innerHTML = items.map(function (c) {
      return '<li><a href="' + (c.id === 'all' ? '#/' : '#/c/' + c.id) + '" data-cat="' + c.id + '"><span>' + esc(c.name) + '</span><span class="n">' + c.count + '</span></a></li>';
    }).join('');
    $('#chips').innerHTML = items.map(function (c) {
      return '<a class="chip" role="tab" href="' + (c.id === 'all' ? '#/' : '#/c/' + c.id) + '" data-cat="' + c.id + '">' + esc(c.id === 'all' ? 'Усі' : c.name) + '<small>' + c.count + '</small></a>';
    }).join('');
  }
  function norm(s) { return String(s).toLowerCase().replace(/[’'`ʼ]/g, '').replace(/ґ/g, 'г'); }
  var index = {};
  function indexProduct(p) {
    var t = norm([p.name, p.code || '', p.brand || '', p.category_name, p.description].join(' '));
    index[p.id] = t + ' ' + t.replace(/[.\-\/]/g, '');
  }
  PRODUCTS.forEach(indexProduct);
  function filtered() {
    var toks = norm(state.q).split(/\s+/).filter(Boolean);
    var list = PRODUCTS.filter(function (p) {
      if (state.cat === 'sale') { if (!isSale(p)) return false; }
      else if (state.cat === 'new') { if (!isNew(p)) return false; }
      else if (state.cat !== 'all' && p.category !== state.cat) return false;
      return toks.every(function (t) { return index[p.id].indexOf(t) >= 0; });
    });
    var order = {}; CATS.forEach(function (c, i) { order[c.id] = i; });
    var oos = function (p) { return /немає/i.test(p.in_stock || '') ? 1 : 0; };
    var pr = function (p) { return hasPrice(p) ? toUah(p.price_eur) : null; };
    if (state.sort === 'pa' || state.sort === 'pd') {
      var dir = state.sort === 'pa' ? 1 : -1;
      list.sort(function (a, b) { if (oos(a) !== oos(b)) return oos(a) - oos(b); var x = pr(a), y = pr(b); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (x - y) * dir; });
    } else if (state.sort === 'na') {
      list.sort(function (a, b) { return oos(a) - oos(b) || a.name.localeCompare(b.name, 'uk'); });
    } else {
      list.forEach(function (p, i) { p._i = i; });
      list.sort(function (a, b) { return oos(a) - oos(b) || order[a.category] - order[b.category] || a._i - b._i; });
    }
    return list;
  }
  var PROMO = { 'ntools-5000b-upgrades': 'Новинка', 'ntools-te20': 'Новинка', 'sata-jet-x-pro': 'Акція', 'antistatic-easy-paint': 'ХІТ' };
  function promoOf(p) { return p.promo != null ? p.promo : PROMO[p.id]; }
  function isSale(p) { return /акці/i.test(promoOf(p) || ''); } // products marked «Акція» (static or set in admin) go to the «Акції» tab
  function isNew(p) { return /новинк/i.test(promoOf(p) || ''); }
  function promoHTML(p) {
    var t = promoOf(p); if (!t) return '';
    if (t === 'ХІТ') return '<span class="promo promo--hit">⭐ ' + t + '</span>';
    if (/новинк/i.test(t)) return '<span class="promo promo--new">Новинка ✅</span>';
    return '<span class="promo">🔥 ' + esc(t) + '</span>';
  }
  function cardHTML(p, i) {
    var eager = i < 8 ? 'eager' : 'lazy';
    return '<li class="card"><div class="card__in">' +
      '<div class="card__media"><button class="card__img" type="button" data-open="' + p.id + '" aria-label="' + esc(p.name) + '"><img ' + mainImg(p) + ' alt="' + esc(p.name) + '" loading="' + eager + '" width="400" height="400">' + promoHTML(p) + '</button>' +
      '<button class="card__add" type="button" data-add="' + p.id + '" aria-label="Додати «' + esc(p.name) + '» в кошик">+</button></div>' +
      '<div class="card__body">' +
        '<span class="card__cat">' + esc(p.category_name) + (p.tds ? ' <span class="tdsb" title="Є технічні дані (ТДС)">ТДС</span>' : '') + '</span>' +
        '<button class="card__name" type="button" data-open="' + p.id + '">' + esc(p.name) + '</button>' +
        '<div class="card__foot">' + pillHTML(p) + stockHTML(p) +
        (!hasPrice(p) && p.price_uah_original ? '<span class="uah">у пості: ' + esc(p.price_uah_original) + '</span>' : '') +
        '</div>' +
        (isGun(p) ? cmpBtnHTML(p, 'cmpt--card') : '') +
      '</div></div></li>';
  }
  var PAGE = 48, curList = [], shown = 0, io = null;
  function renderMore() {
    var next = curList.slice(shown, shown + PAGE);
    $('#grid').insertAdjacentHTML('beforeend', next.map(function (p, i) { return cardHTML(p, shown + i); }).join(''));
    shown += next.length;
    fillPhotos();
    var more = $('#more');
    more.hidden = shown >= curList.length;
    more.textContent = 'Показати ще (' + (curList.length - shown) + ')';
  }
  /* short SEO intro line under the section title (one per category; hidden for «Усі товари» and search) */
  var CAT_INTRO = {
    sale: 'Товари з позначкою «Акція». Ціну і наявність підтверджуємо при замовленні.',
    new: 'Нові надходження з позначкою «Новинка». Ціну і наявність підтверджуємо при замовленні.',
    meiji: 'Японські фарбопульти Meiji від офіційного представника в Україні: FINER-CORE, FINER III, F410, міні-джет FINER SPOT. Дюзу і систему (HVLP / SP) підберемо в Telegram.',
    sata: 'Фарбопульти SATA з технологією RP: SATAjet X DIGITAL pro та SATAjet 100 B.',
    china: 'Бюджетні китайські фарбопульти, зокрема NTools: HVLP, міні-джети та ґрунтовочні на PPS-системі.',
    acc: 'Манометри Meiji (електронний і механічний), бачки, додаткові дюзи та перехідники PPS.',
    lak: 'Лаки Palinal серій 223 і 923: акрилові 2K, HS і UHS, матові — є комплекти 5 л + 2,5 л затверджувача.',
    emal2k: 'Palinal автоемаль 2K Multicryl 900 у готових кольорах RAL, VW, MERC, FORD та інших — глянцеве покриття без лаку.',
    baza: 'Базові фарби Palinal під лак у готових кольорах, банка 1 л — наносяться під 2K лак.',
    grunt: 'Ґрунти Palinal: акрилові наповнювачі 5:1, «мокрий по мокрому», епоксидний, по пластику та Wash Primer.',
    shpak: 'Шпаклівки Palinal: універсальна, полегшена, з алюмінієм, по пластику та розпилювальна.',
    rozch: 'Розчинники Palinal Multicryl (швидкий, стандартний, повільний), антисилікони та добавки для переходів.',
    savex: 'Розчинники та знежирювачі Savex (виробництво Литва): акрилові, для металіків, 646, 647 і GUN CLEANER.',
    tools: 'Інструмент для маляра: антистатичний пістолет EASY PAINT, шліфування, пінники й помпи, змішувальні системи Palinal та інструмент для ПДР.'
  };
  function listTitle() {
    if (state.cat === 'all') return CONFIG.homeTitle;
    if (state.cat === 'sale') return 'Акції — ' + CONFIG.siteName;
    if (state.cat === 'new') return 'Новинки — ' + CONFIG.siteName;
    return catById[state.cat].name + ' — купити в Україні | ' + CONFIG.siteName;
  }
  function renderGrid() {
    var list = filtered();
    curList = list; shown = 0;
    $('#grid').innerHTML = '';
    renderMore();
    $('#empty').hidden = list.length > 0;
    var cn = state.cat === 'sale' ? '🔥 Акції' : state.cat === 'new' ? '✅ Новинки' : state.cat === 'all' ? '' : catById[state.cat].name;
    var title = state.cat === 'all' ? 'Усі товари' : cn;
    if (state.q) title = 'Пошук: «' + state.q + '»' + (state.cat !== 'all' ? ' · ' + cn : '');
    $('#restitle').textContent = title + ' (' + list.length + ')';
    var ci = $('#catintro'); if (ci) { var it = !state.q && CAT_INTRO[state.cat]; ci.textContent = it || ''; ci.hidden = !it; }
    if (!openModalEl) document.title = listTitle();
    $$('[data-cat]').forEach(function (a) { a.classList.toggle('on', a.getAttribute('data-cat') === state.cat); });
    var chip = $('.chip.on'); if (chip && chip.scrollIntoView && window.innerWidth < 900) { var c = $('#chips'); c.scrollLeft = chip.offsetLeft - 16; }
  }

  /* ---------- analytics (GoatCounter events; silently no-op if blocked) ---------- */
  var gcQueue = [], gcTimer = null, gcTries = 0;
  function gcReady() { return !!(window.goatcounter && typeof window.goatcounter.count === 'function'); }
  function gcSend(ev) { try { window.goatcounter.count(ev); } catch (e) {} }
  function gcFlush() {
    gcTimer = null;
    if (gcReady()) { var q = gcQueue; gcQueue = []; q.forEach(gcSend); return; }
    if (++gcTries > 40) { gcQueue = []; return; } // ~12 s: script blocked or offline — drop quietly
    gcTimer = setTimeout(gcFlush, 300);
  }
  function track(path, title) {
    var ev = { path: path, title: title, event: true };
    try {
      if (gcReady()) { gcSend(ev); return; }
      gcQueue.push(ev); // count.js loads async — e.g. direct #/p/… link opened before it arrived
      if (!gcTimer) { gcTries = 0; gcTimer = setTimeout(gcFlush, 300); }
    } catch (e) {}
  }

  /* ---------- власна статистика: Firestore stats/{день за Києвом} (пише js/fb.js), без cookies і персональних даних ----------
     Кожна подія — +1 до одного лічильника; кожну подію рахуємо раз за сесію вкладки (дедуп у sessionStorage), не більше
     STAT_MAX записів за сесію — щоб не з'їсти ліміт безкоштовного плану (~20 тис. записів/добу). Боти й автотести не рахуються. */
  var statWriter = null, statQ = [], STAT_MAX = 40;
  var statSkip = (function () {
    try { return !!navigator.webdriver || /bot|crawl|spider|slurp|lighthouse|headless|preview|facebookexternalhit|whatsapp|telegram/i.test(navigator.userAgent || ''); } catch (e) { return true; }
  })();
  function statDay() {
    try {
      var o = {}; new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).forEach(function (x) { o[x.type] = x.value; });
      if (o.year && o.month && o.day) return o.year + '-' + o.month + '-' + o.day;
    } catch (e) {}
    return new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  }
  function statSend(day, field) { try { var r = statWriter(day, field); if (r && r.catch) r.catch(function () {}); } catch (e) {} }
  // field: views | cart | o_<канал> | p_<id>; dedupe: ключ дедупу (за замовчуванням = field)
  function stat(field, dedupe) {
    try {
      if (statSkip || localStorage.getItem('alexbes_nostats') === '1') return;
      var day = statDay(), key = dedupe || field, s = null;
      try { s = JSON.parse(sessionStorage.getItem('alexbes_st') || 'null'); } catch (e) {}
      if (!s || s.d !== day || !Array.isArray(s.k)) s = { d: day, k: [] };
      if (s.k.indexOf(key) >= 0 || s.k.length >= STAT_MAX) return;
      s.k.push(key); sessionStorage.setItem('alexbes_st', JSON.stringify(s));
      if (statWriter) statSend(day, field); else if (statQ.length < STAT_MAX) statQ.push([day, field]);
    } catch (e) {}
  }
  // клік по кнопці/посиланню замовлення → канал
  function statClick(t) {
    var ch = null, h = (t.getAttribute('href') || '');
    if (t.hasAttribute('data-consult')) ch = 'consult';
    else if (t.hasAttribute('data-order')) ch = 'botp';
    else if (t.hasAttribute('data-botcart')) ch = 'bot';
    else if (t.hasAttribute('data-send')) ch = 'tg';
    else if (t.hasAttribute('data-wa')) ch = 'wa';
    else if (t.hasAttribute('data-viber')) ch = 'viber';
    else if (t.hasAttribute('data-ig')) ch = 'ig';
    else if (/^https:\/\/t\.me\/AlexBes_order_bot/i.test(h)) ch = 'bot';
    else if (/^https:\/\/t\.me\/alex_bespik/i.test(h)) ch = 'tg';
    else if (/^https:\/\/wa\.me\//i.test(h)) ch = 'wa';
    else if (/^viber:/i.test(h)) ch = 'viber';
    else if (/^https:\/\/ig\.me\//i.test(h)) ch = 'ig';
    else if (/^tel:/i.test(h)) ch = 'call';
    if (ch) stat('o_' + ch);
  }

  /* ---------- product modal ---------- */
  var pmState = { id: null, vi: 0, qty: 1 };
  var trackedOpen = null; // product id already counted for the current modal open
  function openProduct(id) {
    var p = byId[id]; if (!p) return;
    if (trackedOpen !== id || !openModalEl || openModalEl !== $('#pmodal')) { trackedOpen = id; track('товар/' + p.id, p.name); stat('p_' + p.id); }
    pmState = { id: id, vi: 0, qty: 1, gi: 0 };
    renderProduct();
    showModal('#pmodal');
    document.title = p.name + ' — ' + CONFIG.siteName;
  }
  function tdsHTML(p) {
    var t = p.tds; if (!t || !t.rows) return '';
    return '<details class="tds" open><summary><span class="emo">📄</span> Технічні дані (ТДС)</summary>' +
      '<dl class="tds__dl">' + t.rows.map(function (r) { return '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>'; }).join('') + '</dl>' +
      '<p class="tds__src">' + (t.url ? '<a href="' + esc(t.url) + '" target="_blank" rel="noopener" data-tds-link>' + esc(t.label) + ' ↗</a>' +
      (t.edition ? ' <span>· ' + esc(t.edition) + '</span>' : '') + '<br>' : '') + '<span>Коротко нашими словами за даними технічного паспорта виробника' + (t.url ? '; у разі розбіжностей діє оригінал.' : '.') + '</span></p></details>';
  }
  function specsHTML(p) {
    var s = p.specs; if (!s || !s.rows) return '';
    return '<details class="tds specs" open><summary><span class="emo">⚙️</span> Технічні характеристики</summary>' +
      '<dl class="tds__dl specs__dl">' + s.rows.map(function (r) { return '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>'; }).join('') + '</dl>' +
      (s.src ? '<p class="tds__src specs__src"><span>' + esc(s.src) + '</span></p>' : '') + '</details>';
  }
  function galleryHTML(p) {
    var g = galleryOf(p), n = g.length;
    if (n <= 1) return '<div class="pm__img"><img ' + imgAttrs(p, g[0]) + ' alt="' + esc(p.name) + '">' + promoHTML(p) + '</div>';
    return '<div class="pm__img gal" data-gal>' +
      '<div class="gal__track" tabindex="0" aria-label="Фото товару, гортайте">' + g.map(function (x, i) {
        return '<div class="gal__it"><img ' + imgAttrs(p, x) + ' alt="' + esc(p.name) + ' — фото ' + (i + 1) + '"' + (i ? ' loading="lazy"' : '') + '></div>';
      }).join('') + '</div>' + promoHTML(p) +
      '<button class="gal__nav gal__nav--p" type="button" data-gal-step="-1" aria-label="Попереднє фото">‹</button>' +
      '<button class="gal__nav gal__nav--n" type="button" data-gal-step="1" aria-label="Наступне фото">›</button>' +
      '<div class="gal__dots">' + g.map(function (x, i) { return '<button type="button" data-gal-to="' + i + '" aria-label="Фото ' + (i + 1) + '"' + (i === 0 ? ' class="on"' : '') + '></button>'; }).join('') + '</div>' +
      '<span class="gal__cnt" data-gal-cnt>1 / ' + n + '</span></div>';
  }
  var PLAY_SVG = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="currentColor" d="M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5Z"/></svg>';
  function videosOf(p) {
    var M = window.AlexBesMedia; if (!M || !Array.isArray(p.videos)) return [];
    return p.videos.slice(0, 5).map(function (u) { return M.parseVideo(u); }).filter(Boolean);
  }
  function videosHTML(p) {
    var vs = videosOf(p); if (!vs.length) return '';
    return '<div class="vids"><p class="vids__ttl"><span class="emo">🎬</span> Відео</p><div class="vids__list">' + vs.map(function (v, i) {
      if (!v.embed) return '<div class="vitem vitem--link"><a class="btn btn--o btn--full vid__link" href="' + esc(v.url) + '" target="_blank" rel="noopener" data-vid-link="' + i + '">' + PLAY_SVG + ' Дивитись відео · ' + esc(v.label) + ' ↗</a></div>';
      return '<div class="vitem"><div class="vid' + (v.vertical ? ' vid--v' : '') + '" data-vid-box="' + i + '"><button class="vid__ph vid__ph--' + v.type + '" type="button" data-vid="' + i + '" aria-label="Відтворити відео ' + esc(v.label) + '">' +
        (v.thumb ? '<img src="' + esc(v.thumb) + '" alt="" loading="lazy">' : '') +
        '<span class="vid__play" aria-hidden="true">' + PLAY_SVG + '</span><span class="vid__lbl">' + esc(v.label) + '</span></button></div>' +
        '<a class="vid__ext" href="' + esc(v.url) + '" target="_blank" rel="noopener">Відкрити в ' + esc(v.type === 'youtube' ? 'YouTube' : v.label) + ' ↗</a></div>';
    }).join('') + '</div></div>';
  }
  function playVideo(i) {
    var p = byId[pmState.id], v = videosOf(p)[i], box = $('[data-vid-box="' + i + '"]');
    if (!v || !box || !v.embed) return;
    box.classList.add('is-on'); if (box.parentNode) box.parentNode.classList.add('is-on');
    box.innerHTML = '<iframe src="' + esc(v.embed) + '" title="' + esc(v.label + ': ' + p.name) + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>';
    track('відео/' + p.id, 'Відео (' + v.label + '): ' + p.name);
  }
  function stopMedia() { $$('#pm iframe').forEach(function (f) { f.remove(); }); }
  function galInit() {
    var g = $('#pm [data-gal]'); if (!g) return;
    var tr = $('.gal__track', g), dots = $$('.gal__dots button', g), cnt = $('[data-gal-cnt]', g), n = dots.length;
    var cur = Math.min(pmState.gi || 0, n - 1);
    function sync() {
      var i = Math.round(tr.scrollLeft / Math.max(1, tr.clientWidth)); i = Math.max(0, Math.min(n - 1, i));
      if (i === cur && dots[i].classList.contains('on')) return;
      cur = i; pmState.gi = i;
      dots.forEach(function (d, k) { d.classList.toggle('on', k === i); });
      if (cnt) cnt.textContent = (i + 1) + ' / ' + n;
    }
    tr.addEventListener('scroll', function () { clearTimeout(tr._t); tr._t = setTimeout(sync, 60); }, { passive: true });
    if (cur) { tr.scrollLeft = cur * tr.clientWidth; dots.forEach(function (d, k) { d.classList.toggle('on', k === cur); }); if (cnt) cnt.textContent = (cur + 1) + ' / ' + n; }
  }
  function galGo(to, rel) {
    var g = $('#pm [data-gal]'); if (!g) return;
    var tr = $('.gal__track', g), n = $$('.gal__it', g).length, w = tr.clientWidth;
    var i = Math.round(tr.scrollLeft / Math.max(1, w));
    var j = rel ? i + to : to; if (j < 0) j = n - 1; if (j >= n) j = 0;
    tr.scrollTo({ left: j * w, behavior: 'smooth' });
  }
  function renderProduct() {
    var p = byId[pmState.id];
    var vars = p.variants ? '<div class="vars" role="radiogroup" aria-label="Варіант">' + p.variants.map(function (v, i) {
      return '<button type="button" class="var' + (i === pmState.vi ? ' on' : '') + '" data-var="' + i + '" role="radio" aria-checked="' + (i === pmState.vi) + '">' + esc(uahText(v.label)) + '<b>' + uah(v.price_eur) + '</b></button>';
    }).join('') + '</div>' : '';
    var price = hasPrice(p) ? '<span class="pill" style="font-size:22px;padding:7px 16px">' + uah(unitPrice(p, pmState.vi)) + (unitLabel(p, pmState.vi) ? ' <small>· ' + esc(uahText(unitLabel(p, pmState.vi))) + '</small>' : '') + '</span>'
      : '<span class="pill pill--ask" style="font-size:16px;padding:7px 16px">Ціну уточнюйте</span>' + (p.price_uah_original ? ' <span class="muted small">у пості: ' + esc(p.price_uah_original) + '</span>' : '');
    var src = (p.source || []).filter(function (u) { return /^https:\/\/t\.me\//.test(u); })[0];
    var tgAsk = 'https://t.me/share/url?url=' + encodeURIComponent('https://t.me/alex_bes_shoping') + '&text=' + encodeURIComponent('Вітаю! Цікавить: ' + p.name + (hasPrice(p) ? '' : ' — яка ціна?'));
    $('#pm').innerHTML =
      galleryHTML(p) +
      '<div class="pm__info">' +
        '<span class="pm__cat">' + esc(p.category_name) + '</span>' +
        '<h2 id="pm-name">' + esc(p.name) + '</h2>' +
        '<div>' + price + '</div>' + vars +
        stockHTML(p) +
        '<p class="pm__desc">' + esc(uahText(p.description)) + '</p>' + videosHTML(p) +
        '<div class="pm__buy"><div class="qty"><button type="button" data-q="-1" aria-label="Менше">−</button><input id="pmq" type="number" min="1" value="' + pmState.qty + '" aria-label="Кількість"><button type="button" data-q="1" aria-label="Більше">+</button></div>' +
        '<button class="btn btn--y" type="button" data-addpm>🛒 Додати в кошик</button>' + (isGun(p) ? cmpBtnHTML(p, 'btn cmpt--pm') : '') + '</div>' +
        '<div class="cactions">' +
          '<a class="btn btn--bot btn--full" href="' + CONFIG.orderBot + '?start=' + encodeURIComponent(p.id) + '" target="_blank" rel="noopener" data-order="' + esc(p.id) + '">🤖 Замовити через бота</a>' +
          '<a class="btn btn--o" href="' + CONFIG.orderTelegram + '" target="_blank" rel="noopener">✈️ Telegram</a>' +
          '<a class="btn btn--o" href="' + CONFIG.whatsapp + '?text=' + encodeURIComponent('Вітаю! Цікавить: ' + p.name + (hasPrice(p) ? '' : ' — яка ціна?')) + '" target="_blank" rel="noopener">🟢 WhatsApp</a>' +
          '<a class="btn btn--o" href="' + CONFIG.viber + '">🟣 Viber</a>' +
          '<a class="btn btn--o" href="' + CONFIG.instagram + '" target="_blank" rel="noopener">📸 Instagram</a>' +
        '</div>' +
        specsHTML(p) + tdsHTML(p) +
        '<p class="pm__note">' + esc(uahText(p.price_note || '')) + (src ? ' · <a href="' + src + '" target="_blank" rel="noopener">пост у каналі</a>' : '') + '</p>' +
      '</div>';
    galInit();
    fillPhotos();
  }

  /* ---------- cart ---------- */
  function cartCount() { return cart.reduce(function (s, l) { return s + l.qty; }, 0); }
  function addToCart(id, vi, qty) {
    vi = vi || 0; qty = Math.max(1, qty || 1);
    var l = cart.filter(function (x) { return x.id === id && x.vi === vi; })[0];
    if (l) l.qty += qty; else cart.push({ id: id, vi: vi, qty: qty });
    saveCart(); updateBadges();
    stat('cart', 'cart:' + id + ':' + vi);
    var p = byId[id];
    toast('Додано: ' + p.name + (variantOf(p, vi) ? ' (' + uahText(variantOf(p, vi).label) + ')' : ''));
  }
  function updateBadges() {
    var n = cartCount();
    $$('[data-cart-count]').forEach(function (b) { b.textContent = n; b.hidden = n === 0; });
  }
  // кошик → start-параметр бота: c_<індекс36>-<к-сть>[-<варіант>]_..._m<невідомі> (ліміт Telegram 64 символи)
  function botCartTokens(room) { // "_<i36>-<qty>[-<vi>]…[_m<N>]": токени займають ≤ room символів, решта рахується в _m
    var out = '', miss = 0;
    cart.forEach(function (l) {
      var i = (typeof STATIC_IDX !== 'undefined') ? STATIC_IDX[l.id] : undefined;
      var tok = i == null ? null : '_' + i.toString(36) + '-' + Math.max(1, l.qty | 0) + (byId[l.id] && byId[l.id].variants ? '-' + (l.vi | 0) : '');
      if (tok && (out + tok).length <= room) out += tok; else miss++;
    });
    return out + (miss ? '_m' + miss : '');
  }
  function botCartPayload() { var t = botCartTokens(57); return t ? 'c' + t : 'order'; }
  /* Повне замовлення для бота: документ orders/<id> у Firestore (пише js/fb.js) + посилання t.me/<бот>?start=o_<id><токени кошика>.
     Токени кошика в тому ж посиланні — запасний варіант, якщо документ не записався. */
  var orderWriter = null; // function (id, data) -> Promise; ставить js/fb.js, коли Firebase завантажився
  function genOrderId() {
    var A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', id = '';
    var c = window.crypto || window.msCrypto;
    while (id.length < 20) {
      var buf = new Uint8Array(32);
      if (c && c.getRandomValues) c.getRandomValues(buf); else for (var k = 0; k < 32; k++) buf[k] = Math.floor(Math.random() * 256);
      for (var j = 0; j < buf.length && id.length < 20; j++) if (buf[j] < 248) id += A.charAt(buf[j] % 62); // без зсуву розподілу
    }
    return id;
  }
  function clipS(s, n) { s = String(s == null ? '' : s).trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function siteOrderData() {
    var items = [], sum = 0, ask = 0;
    cart.forEach(function (l) {
      var p = byId[l.id], v = variantOf(p, l.vi), up = unitPrice(p, l.vi);
      var vl = v ? v.label : (p.price_label || '');
      var it = { id: clipS(p.id, 80), name: clipS(p.name, 300), qty: Math.max(1, Math.min(9999, l.qty | 0)), price_uah: up != null ? toUah(up) : null };
      if (vl) it.variant = clipS(uahText(vl).replace(/\u00a0/g, ' '), 200);
      if (up != null) sum += toUah(up) * it.qty; else ask++;
      items.push(it);
    });
    var json = JSON.stringify(items);
    while (json.length > 14500 && items.length > 1) { items.pop(); json = JSON.stringify(items); } // ліміт правил — решта є в text
    return {
      v: 1, items: json, count: cart.length, total_uah: Math.min(1e9, sum), ask: ask,
      text: clipS(orderText(), 6000),
      name: clipS(form.name, 100), phone: clipS(form.phone, 40), city: clipS(form.city, 200), note: clipS(form.note, 1000)
    };
  }
  // null — Firebase не готовий або запис не стартував: тоді працює звичайне посилання c_… (href кнопки)
  function siteOrderLink() {
    if (!orderWriter || !cart.length) return null;
    var id = genOrderId(), data;
    try { data = siteOrderData(); } catch (e) { return null; }
    var p = orderWriter(id, data);
    if (!p || typeof p.then !== 'function') return null;
    p.then(function () { track('бот/кошик-firestore', 'Замовлення з кошика передано боту'); }, function (e) { try { console.warn('order doc not saved', e && e.code); } catch (x) {} });
    return CONFIG.orderBot + '?start=o_' + id + botCartTokens(36); // 2+20+≤36+_mN ≤ 64
  }
  function orderText() {
    var lines = ['Вітаю! Хочу замовити (з сайту ' + CONFIG.siteName + '):', ''];
    var sum = 0, ask = 0;
    cart.forEach(function (l, i) {
      var p = byId[l.id], v = variantOf(p, l.vi), up = unitPrice(p, l.vi);
      var nm = p.name + (v ? ' (' + v.label + ')' : (p.price_label ? ' (' + p.price_label + ')' : ''));
      nm = uahText(nm).replace(/\u00a0/g, ' ');
      if (up != null) { sum += toUah(up) * l.qty; lines.push((i + 1) + '. ' + nm + ' — ' + l.qty + ' шт × ' + uahTxt(up) + ' = ' + fmtUah(toUah(up) * l.qty)); }
      else { ask++; lines.push((i + 1) + '. ' + nm + ' — ' + l.qty + ' шт — ціну уточнити'); }
    });
    lines.push('');
    lines.push('Разом: ' + fmtUah(sum) + (ask ? ' + ' + ask + ' поз. з ціною на уточненні' : ''));
    var f = form;
    if (f.name) lines.push("Ім'я: " + f.name);
    if (f.phone) lines.push('Телефон: ' + f.phone);
    if (f.city) lines.push('Місто / доставка: ' + f.city);
    if (f.note) lines.push('Коментар: ' + f.note);
    lines.push('', 'Прошу підтвердити ціну та наявність 🙏');
    return lines.join('\n');
  }
  function renderCart() {
    var body = $('#cartbody');
    if (!cart.length) {
      body.innerHTML = '<div class="cempty"><span class="emo">😈</span>Кошик порожній.<br>Додайте товари з каталогу — і надішліть замовлення в Telegram.<br><br><button class="btn btn--y" type="button" data-close>До каталогу</button></div>';
      return;
    }
    var sum = 0, ask = 0;
    var items = cart.map(function (l, i) {
      var p = byId[l.id], v = variantOf(p, l.vi), up = unitPrice(p, l.vi);
      if (up != null) sum += toUah(up) * l.qty; else ask++;
      return '<li class="citem"><img ' + mainImg(p) + ' alt="">' +
        '<div><div class="citem__n">' + esc(p.name) + '</div><div class="citem__v">' + esc(uahText(v ? v.label : (p.price_label || ''))) + '</div>' +
        '<div class="citem__p">' + (up != null ? uah(up) + ' × ' + l.qty : 'Ціну уточнюйте') + '</div></div>' +
        '<div class="citem__r"><div class="qty"><button type="button" data-cq="' + i + '" data-d="-1" aria-label="Менше">−</button><input type="number" min="1" value="' + l.qty + '" data-ci="' + i + '" aria-label="Кількість"><button type="button" data-cq="' + i + '" data-d="1" aria-label="Більше">+</button></div>' +
        '<button class="rm" type="button" data-rm="' + i + '">видалити</button></div></li>';
    }).join('');
    body.innerHTML = '<ul class="citems">' + items + '</ul>' +
      '<div class="ctotal"><span>Разом' + (ask ? ' <span class="muted small">(+ ' + ask + ' поз. на уточненні)</span>' : '') + '</span><b>' + fmtUah(sum).replace(/ /g, '\u00a0') + '</b></div>' +
      '<p class="cnote">Ціни в гривнях. Остаточну ціну, наявність, доставку та оплату підтверджуємо в Telegram або телефоном.</p>' +
      '<div class="cform">' +
        '<label>Ім’я<input data-f="name" value="' + esc(form.name || '') + '" autocomplete="name"></label>' +
        '<label>Телефон<input data-f="phone" value="' + esc(form.phone || '') + '" type="tel" autocomplete="tel"></label>' +
        '<label class="full">Місто / доставка<input data-f="city" value="' + esc(form.city || '') + '" placeholder="Місто, спосіб доставки"></label>' +
        '<label class="full">Коментар<textarea data-f="note" rows="2" placeholder="Дюза, система, питання…">' + esc(form.note || '') + '</textarea></label>' +
      '</div>' +
      '<details class="preview preview--top"><summary>📝 Текст замовлення</summary><pre id="otext"></pre></details>' +
      '<div class="cactions">' +
        '<a class="btn btn--bot btn--full" href="' + CONFIG.orderBot + '?start=' + botCartPayload() + '" target="_blank" rel="noopener" data-botcart>🤖 Бот для замовлень</a>' +
        '<button class="btn btn--y btn--full" type="button" data-send>✈️ Надіслати в Telegram</button>' +
        '<button class="btn btn--y" type="button" data-wa>🟢 WhatsApp</button>' +
        '<button class="btn btn--y" type="button" data-viber>🟣 Viber</button>' +
        '<button class="btn btn--b" type="button" data-ig>📸 Instagram</button>' +
        '<button class="btn btn--o" type="button" data-copy>📋 Скопіювати текст</button>' +
        '<a class="btn btn--o btn--full" href="tel:' + CONFIG.phone + '">📞 Подзвонити ' + CONFIG.phoneLabel + '</a>' +
      '</div>' +
      '<p class="cnote" style="margin-top:10px">Оберіть зручний месенджер. У Telegram, WhatsApp і Viber текст замовлення підставиться сам — просто натисніть «Надіслати».</p>';
    $('#otext').textContent = orderText();
    fillPhotos();
  }
  function copyText(t) {
    function fallback() {
      var ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); var ok = false; try { ok = document.execCommand('copy'); } catch (e) {} document.body.removeChild(ta); return ok;
    }
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t).then(function () { return true; }, function () { return fallback(); });
    return Promise.resolve(fallback());
  }

  /* ---------- modal helpers ---------- */
  var openModalEl = null, lastFocus = null;
  function showModal(sel) {
    if (openModalEl && openModalEl !== $(sel)) openModalEl.hidden = true;
    lastFocus = document.activeElement;
    openModalEl = $(sel); openModalEl.hidden = false; document.body.style.overflow = 'hidden';
    var x = openModalEl.querySelector('.modal__x'); if (x) x.focus({ preventScroll: true });
  }
  function hideModal() {
    if (!openModalEl) return;
    stopMedia();
    openModalEl.hidden = true; openModalEl = null; document.body.style.overflow = ''; trackedOpen = null;
    document.title = listTitle();
    if (/^#\/p\/|^#cart|^#compare/.test(location.hash)) history.replaceState(null, '', lastListHash);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  var tt;
  function toast(msg) { var t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(tt); tt = setTimeout(function () { t.hidden = true; }, 2600); }

  /* ---------- routing ---------- */
  function route() {
    var h = location.hash || '#/';
    var m;
    if ((m = h.match(/^#\/p\/([\w-]+)/))) {
      if (!$('#grid').children.length) renderGrid(); // direct product link: have the catalog ready behind the modal
      if (byId[m[1]]) { openProduct(m[1]); return; }
      if (openModalEl) { openModalEl.hidden = true; openModalEl = null; document.body.style.overflow = ''; } // unknown/hidden product (maybe loads from Firestore later)
      return;
    }
    if (h === '#cart') { renderCart(); showModal('#cmodal'); return; }
    if (h === '#compare') { if (!$('#grid').children.length) renderGrid(); renderCompare(); showModal('#cmpmodal'); track('порівняння', 'Порівняння фарбопультів (' + cmpList().length + ')'); return; }
    if (openModalEl) { stopMedia(); openModalEl.hidden = true; openModalEl = null; document.body.style.overflow = ''; }
    trackedOpen = null;
    if (h === '#how') { $$('[data-nav]').forEach(function (a) { a.classList.toggle('on', a.getAttribute('data-nav') === 'how'); }); return; }
    var navOn = /^#\/c\/sale/.test(h) ? 'sale' : 'catalog';
    $$('[data-nav]').forEach(function (a) { a.classList.toggle('on', a.getAttribute('data-nav') === navOn); });
    var prevCat = state.cat;
    if ((m = h.match(/^#\/c\/([\w-]+)/)) && (catById[m[1]] || m[1] === 'sale' || m[1] === 'new')) state.cat = m[1]; else state.cat = 'all';
    lastListHash = h;
    renderGrid();
    if (prevCat !== state.cat && window.scrollY > $('#catalog').offsetTop + 40) window.scrollTo(0, Math.max(0, $('#catalog').offsetTop - ($('.hdr') ? $('.hdr').offsetHeight : 0)));
  }

  /* ---------- порівняння фарбопультів (до 3 шт., localStorage) ----------
     Характеристики НЕ вигадуємо: лише те, що є в назві, описі та p.specs.rows товару. Немає значення — «—». */
  var CMP_MAX = 3, CMP_KEY = 'alexbes_compare';
  var GUN_CATS = { meiji: 1, sata: 1, china: 1 }; // Фарбопульти Meiji / SATA / Китай (NTools тощо)
  function isGun(p) { return !!p && !!GUN_CATS[p.category]; }
  var cmpIds = (function () { var a = load(CMP_KEY, []); return Array.isArray(a) ? a.filter(function (x) { return typeof x === 'string'; }).slice(0, CMP_MAX) : []; })();
  function cmpList() { return cmpIds.filter(function (id) { return isGun(byId[id]); }); }
  function cmpHas(id) { return cmpList().indexOf(id) >= 0; }
  function cmpSave() { cmpIds = cmpList(); save(CMP_KEY, cmpIds); }
  var N_RE = '\\d+(?:[.,]\\d+)?';
  var LOW = '[а-яіїєґ\'’ʼ]*';
  function specRows(p, labelRe, skipRe) { return ((p.specs && p.specs.rows) || []).filter(function (r) { return r && labelRe.test(r[0]) && !(skipRe && skipRe.test(r[0])); }); }
  function uniq(a) { var o = []; a.forEach(function (x) { if (o.indexOf(x) < 0) o.push(x); }); return o; }
  function comma(s) { return String(s).replace('.', ','); }
  function numOf(s) { return parseFloat(String(s).replace(',', '.')); }
  // числа з одиницею в рядку специфікації: "SP — 2,0 бар · HVLP — 1,8 бар (…)", "1,0 — 200 · … · 2,5 — 340 мм", "1,5–2,0 бар"
  function numVals(v, unitRe) {
    v = String(v).replace(/\([^)]*\)/g, ' ');
    var re = new RegExp('(?:\\b(SP|HVLP|LVLP|RP)\\s*[—–-]\\s*)?(?:^|[^\\d.,])(' + N_RE + ')(?:\\s*[–-]\\s*(' + N_RE + '))?(?=\\s*(?:' + unitRe + ')?\\s*(?:·|;|,\\s|$))', 'g');
    var out = [], m;
    while ((m = re.exec(v))) out.push({ pre: m[1] || '', a: m[2], b: m[3] || '' });
    return out;
  }
  function fmtVals(vals, unit) {
    if (!vals.length) return '';
    if (vals.every(function (x) { return x.pre && !x.b; })) return uniq(vals.map(function (x) { return x.pre + ' ' + x.a; })).join(' · ') + ' ' + unit;
    var singles = uniq(vals.filter(function (x) { return !x.b; }).map(function (x) { return x.a; }));
    var ranges = uniq(vals.filter(function (x) { return x.b; }).map(function (x) { return x.a + '–' + x.b; }));
    var s = '';
    if (singles.length > 2) {
      var ns = singles.map(numOf), lo = singles[ns.indexOf(Math.min.apply(null, ns))], hi = singles[ns.indexOf(Math.max.apply(null, ns))];
      s = lo + '–' + hi;
    } else s = singles.join(' / ');
    if (s && ranges.length) return s + ' ' + unit + ' (діапазон ' + ranges.join(', ') + ')';
    return (s || ranges.join(', ')) + ' ' + unit;
  }
  function rowNum(p, labelRe, unitRe, unit, skipRe) {
    var vals = [];
    specRows(p, labelRe, skipRe).forEach(function (r) { vals = vals.concat(numVals(r[1], unitRe)); });
    return fmtVals(vals, unit);
  }
  function descNum(p, re, unit) { var m = String(p.description || '').match(re); return m ? (m[1] ? 'до ' : '') + comma(m[2]) + ' ' + unit : ''; } // re: (до)? (число)
  function gunSpecs(p) {
    var name = String(p.name || ''), desc = String(p.description || ''), rows = (p.specs && p.specs.rows) || [];
    var all = name + ' . ' + desc + ' . ' + rows.map(function (r) { return r[0] + ': ' + r[1]; }).join(' . ');
    var S = {};
    // система розпилу
    var sysSrc = name + ' . ' + desc + ' . ' + specRows(p, /систем|виконан|модель|серія/i).map(function (r) { return r[0] + ' ' + r[1]; }).join(' . ');
    var SYS = [['HVLP', /\bHVLP\b/], ['LVLP', /\bLVLP\b/], ['RP', /\bRP\b/], ['Trans-Tech', /\bTrans[- ]?Tech\b/i], ['SP', /\bSP\b/], ['EV', /\bEV\b/], ['EVW', /\bEVW\b/]];
    S.system = SYS.filter(function (s) { return s[1].test(sysSrc); }).map(function (s) { return s[0]; }).join(' · '); // фіксований порядок
    // дюза / сопло, мм
    var nz = [];
    function addNz(s) { var x = numOf(s); if (x >= 0.2 && x <= 3.5) nz.push(x); }
    specRows(p, /дюз|сопл/i).forEach(function (r) { (String(r[1]).match(/\d[.,]\d/g) || []).forEach(addNz); });
    var nm, nre = /(?:^|[\s(\/])(\d[.,]\d)(?=$|[\s)\/,])/g; while ((nm = nre.exec(name))) addNz(nm[1]);
    var NZ1 = '\\d[.,]\\d', dre = new RegExp('(?:дюз|сопл)' + LOW + '\\s*(?:[—:–-]\\s*)?(?:від\\s+)?(' + NZ1 + '(?:\\s*(?:мм)?\\s*(?:,\\s|\\/|·|або|та|і|до|–|-)\\s*' + NZ1 + ')*)', 'gi');
    while ((nm = dre.exec(desc))) (nm[1].match(/\d[.,]\d/g) || []).forEach(addNz);
    nz = uniq(nz).sort(function (a, b) { return a - b; });
    S.nozzle = nz.map(function (x) { return x.toFixed(1).replace('.', ','); }).join(' / ');
    // подача фарби
    var feed = [];
    if (/гравітац/i.test(all)) feed.push('гравітаційна');
    var pos = (name + ' . ' + desc + ' . ' + specRows(p, /подача|бачок/i).map(function (r) { return r[1]; }).join(' . ')).match(/(верхн|бічн|нижн)[а-яії]*\s+(?:пластиков[а-яії]*\s+)?бач/i);
    if (pos) feed.push({ 'верхн': 'верхній бачок', 'бічн': 'бічний бачок', 'нижн': 'нижній бачок' }[pos[1].toLowerCase()]);
    S.feed = feed.join(', ');
    // бачок: комплектація, об'єм, з'єднання
    var cupRow = specRows(p, /^бачок/i).map(function (r) { return r[1]; }).join(' . ');
    var cup = [];
    if (/без\s+бачка/i.test(desc)) cup.push('без бачка');
    else if (/не\s+входить/i.test(cupRow)) cup.push('не входить');
    else if (/у\s+комплекті[^.]{0,40}бач|бач[а-яії]*[^.]{0,30}у\s+комплекті|комплектує[^.]{0,40}бачк/i.test(desc + ' . ' + rows.map(function (r) { return r[1]; }).join(' . '))) cup.push('у комплекті');
    else if (/опційно/i.test(cupRow)) cup.push('опційно');
    var vol = cupRow.match(/(\d+(?:[.,]\d+)?)\s*л(?![а-яіїєґa-z])/i); if (vol) cup.push(comma(vol[1]) + ' л');
    if (/\bQCC\b/.test(all)) cup.push('QCC');
    if (/перехідник\s+PPS/i.test(desc)) cup.push('перехідник PPS — опція'); else if (/\bPPS\b/.test(all)) cup.push('PPS');
    S.cup = cup.join(' · ');
    // тиск, витрати, факел, відстань, вага
    S.pressure = rowNum(p, /тиск/i, 'бар', 'бар') || descNum(p, /тиск\S*\s+(до\s+)?(\d+(?:[.,]\d+)?)\s*бар/i, 'бар');
    S.air = rowNum(p, /витрата\s+повітря/i, 'л\\/хв', 'л/хв') || descNum(p, /витрат\S*\s+повітря\s+(до\s+)?(\d+(?:[.,]\d+)?)\s*л\/хв/i, 'л/хв');
    S.paint = rowNum(p, /витрата\s+фарби/i, 'мл\\/хв', 'мл/хв');
    S.width = rowNum(p, /ширина\s+факела/i, 'мм', 'мм');
    S.dist = rowNum(p, /відстань/i, 'мм', 'мм');
    var wRows = specRows(p, /^вага/i);
    S.weight = rowNum(p, /^вага/i, 'г', 'г') || descNum(p, /ваг[аиу]\s+()(\d+)\s*г(?![а-яіїєґ])/i, 'г');
    if (S.weight && wRows.some(function (r) { return /корпус/i.test(r[0]); })) S.weight += ' (корпус)';
    // водні фарби (рядок «Бачок» не враховуємо — там мова про бачок, а не пістолет)
    var noCup = name + ' . ' + desc + ' . ' + rows.filter(function (r) { return !/^бачок/i.test(r[0]); }).map(function (r) { return r[0] + ': ' + r[1]; }).join(' . ');
    S.water = (specRows(p, /водні\s+фарби/i).some(function (r) { return /^так/i.test(r[1]); }) || /для\s+водн|водн[а-яії]*\s+(?:та|і)\s+сольвентн|водні\s+бази|водних\s+баз|підходить\s+для\s+водн/i.test(noCup)) ? 'так' : '';
    // особливості
    var feat = [];
    if (/міні-?джет/i.test(all)) feat.push('міні-джет');
    if (/ґрунтовоч/i.test(name + desc) || specRows(p, /призначення/i).some(function (r) { return /ґрунт/i.test(r[1]); })) feat.push('для ґрунтів');
    if (/локальн/i.test(all)) feat.push('локальний ремонт');
    if (/цифров\S*\s+(?:манометр|блок)/i.test(all)) feat.push('цифровий манометр');
    if (/розрізн\S*\s+дюз/i.test(all)) feat.push('розрізна дюза');
    if (/MMFT/.test(all)) feat.push('MMFT');
    S.feat = feat.join(', ');
    return S;
  }
  var CMP_ROWS = [
    ['system', 'Система'], ['nozzle', 'Дюза, мм'], ['feed', 'Подача фарби'], ['cup', 'Бачок'], ['pressure', 'Тиск'],
    ['air', 'Витрата повітря'], ['paint', 'Витрата фарби'], ['width', 'Ширина факела'], ['dist', 'Відстань розпилення'],
    ['weight', 'Вага'], ['water', 'Водні фарби'], ['feat', 'Особливості']
  ];
  function cmpBtnHTML(p, cls) {
    var on = cmpHas(p.id);
    return '<button class="cmpt' + (cls ? ' ' + cls : '') + (on ? ' on' : '') + '" type="button" data-cmp="' + esc(p.id) + '" aria-pressed="' + on + '" title="Порівняти фарбопульти (до ' + CMP_MAX + ')">' + (on ? '✓ У порівнянні' : '⚖️ Порівняти') + '</button>';
  }
  function cmpSync() {
    var list = cmpList(), n = list.length;
    $$('[data-cmp]').forEach(function (b) {
      var on = list.indexOf(b.getAttribute('data-cmp')) >= 0;
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); b.textContent = on ? '✓ У порівнянні' : '⚖️ Порівняти';
    });
    var bar = $('#cmpbar');
    if (bar) { $$('[data-cmp-count]', bar).forEach(function (x) { x.textContent = n; }); bar.hidden = n === 0; }
    document.body.classList.toggle('has-cmpbar', n > 0);
  }
  function toggleCmp(id) {
    var p = byId[id]; if (!isGun(p)) return;
    var list = cmpList(), i = list.indexOf(id);
    if (i >= 0) { list.splice(i, 1); cmpIds = list; cmpSave(); cmpSync(); toast('Прибрано з порівняння'); }
    else {
      if (list.length >= CMP_MAX) { toast('Можна порівняти до ' + CMP_MAX + ' фарбопультів — приберіть один'); return; }
      list.push(id); cmpIds = list; cmpSave(); cmpSync(); toast('Додано до порівняння (' + list.length + '/' + CMP_MAX + ')');
    }
    if (openModalEl && openModalEl === $('#cmpmodal')) renderCompare();
  }
  function renderCompare() {
    var body = $('#cmpbody'); if (!body) return;
    var list = cmpList().map(function (id) { return byId[id]; });
    if (!list.length) {
      body.innerHTML = '<div class="cempty"><span class="emo">⚖️</span>Ще нічого не обрано.<br>Натисніть «⚖️ Порівняти» на картці фарбопульта — можна до ' + CMP_MAX + ' шт.<br><br><a class="btn btn--y" href="#/c/meiji">До фарбопультів</a></div>';
      return;
    }
    var specs = list.map(gunSpecs), n = list.length;
    var head = '<div class="cmp__l cmp__l--h">Фарбопульт</div>' + list.map(function (p) {
      return '<div class="cmp__h">' +
        '<button class="cmp__rm" type="button" data-cmp-rm="' + esc(p.id) + '" aria-label="Прибрати «' + esc(p.name) + '» з порівняння">✕</button>' +
        '<button class="cmp__img" type="button" data-open="' + esc(p.id) + '" aria-label="' + esc(p.name) + '"><img ' + mainImg(p) + ' alt="' + esc(p.name) + '" width="200" height="200"></button>' +
        '<span class="cmp__cat">' + esc(p.category_name) + '</span>' +
        '<button class="cmp__name" type="button" data-open="' + esc(p.id) + '">' + esc(p.name) + '</button>' +
        '<div class="cmp__price">' + pillHTML(p) + '</div>' +
        '<button class="btn btn--y cmp__add" type="button" data-add="' + esc(p.id) + '">🛒 В кошик</button>' +
      '</div>';
    }).join('');
    var rowsHTML = CMP_ROWS.filter(function (r) { return specs.some(function (s) { return s[r[0]]; }); }).map(function (r) {
      return '<div class="cmp__l">' + esc(r[1]) + '</div>' + specs.map(function (s) {
        return '<div class="cmp__v' + (s[r[0]] ? '' : ' cmp__v--na') + '">' + esc(s[r[0]] || '—') + '</div>';
      }).join('');
    }).join('');
    var stock = '<div class="cmp__l">Наявність</div>' + list.map(function (p) { return '<div class="cmp__v">' + stockHTML(p) + '</div>'; }).join('');
    body.innerHTML = (n < 2 ? '<p class="cmp__hint">Додайте ще ' + (n === 1 ? 'один-два фарбопульти' : '') + ' — кнопка «⚖️ Порівняти» на картці товару.</p>' : '') +
      '<div class="cmp" style="--n:' + n + '">' + head + rowsHTML + stock + '</div>' +
      '<p class="cnote cmp__note">Характеристики — з опису товару та даних виробника на сайті; «—» означає, що даних немає. Дюзу, систему та комплектацію уточнюйте в Telegram.</p>' +
      '<div class="cmp__acts"><button class="btn btn--o" type="button" data-cmp-clear>🗑 Очистити</button><a class="btn btn--y" href="#/c/meiji">+ Додати ще</a></div>';
    fillPhotos();
  }

  /* ---------- events ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('button, a'); if (!t) { if (e.target.hasAttribute && e.target.hasAttribute('data-close')) hideModal(); return; }
    statClick(t);
    if (t.hasAttribute('data-close')) { e.preventDefault(); hideModal(); return; }
    if (t.hasAttribute('data-consult')) { track('консультація', 'Отримати консультацію (Telegram Alex)'); return; } // home banner button; link opens normally
    if (t.hasAttribute('data-order')) { var op = byId[t.getAttribute('data-order')]; if (op) track('замовити/' + op.id, 'Замовити: ' + op.name); return; } // no preventDefault: link opens the bot as usual
    if (t.hasAttribute('data-open')) { location.hash = '#/p/' + t.getAttribute('data-open'); return; }
    if (t.hasAttribute('data-add')) {
      var p = byId[t.getAttribute('data-add')];
      if (p.variants && p.variants.length > 1) { location.hash = '#/p/' + p.id; toast('Оберіть варіант'); return; }
      addToCart(p.id, 0, 1); return;
    }
    if (t.hasAttribute('data-var')) { pmState.vi = +t.getAttribute('data-var'); renderProduct(); return; }
    if (t.hasAttribute('data-gal-step')) { galGo(+t.getAttribute('data-gal-step'), true); return; }
    if (t.hasAttribute('data-gal-to')) { galGo(+t.getAttribute('data-gal-to'), false); return; }
    if (t.hasAttribute('data-vid')) { playVideo(+t.getAttribute('data-vid')); return; }
    if (t.hasAttribute('data-vid-link')) { var vp = byId[pmState.id]; if (vp) track('відео/' + vp.id, 'Відео (посилання): ' + vp.name); return; }
    if (t.hasAttribute('data-q')) { pmState.qty = Math.max(1, (parseInt($('#pmq').value, 10) || 1) + +t.getAttribute('data-q')); $('#pmq').value = pmState.qty; return; }
    if (t.hasAttribute('data-addpm')) { pmState.qty = Math.max(1, parseInt($('#pmq').value, 10) || 1); addToCart(pmState.id, pmState.vi, pmState.qty); return; }
    if (t.hasAttribute('data-cmp')) { toggleCmp(t.getAttribute('data-cmp')); return; }
    if (t.hasAttribute('data-cmp-rm')) { var ri = cmpIds.indexOf(t.getAttribute('data-cmp-rm')); if (ri >= 0) cmpIds.splice(ri, 1); cmpSave(); cmpSync(); renderCompare(); return; }
    if (t.hasAttribute('data-cmp-clear')) { cmpIds = []; cmpSave(); cmpSync(); if (openModalEl && openModalEl === $('#cmpmodal')) renderCompare(); toast('Порівняння очищено'); return; }
    if (t.hasAttribute('data-open-cmp')) { e.preventDefault(); if (location.hash !== '#compare') { if (!/^#\/p\/|^#cart/.test(location.hash)) lastListHash = location.hash || '#/'; location.hash = '#compare'; } else { renderCompare(); showModal('#cmpmodal'); } return; }
    if (t.hasAttribute('data-open-cart')) { e.preventDefault(); if (location.hash !== '#cart') { if (!/^#\/p\//.test(location.hash)) lastListHash = location.hash || '#/'; location.hash = '#cart'; } else { renderCart(); showModal('#cmodal'); } return; }
    if (t.hasAttribute('data-cq')) { var i = +t.getAttribute('data-cq'); cart[i].qty = Math.max(1, cart[i].qty + +t.getAttribute('data-d')); saveCart(); updateBadges(); renderCart(); return; }
    if (t.hasAttribute('data-rm')) { cart.splice(+t.getAttribute('data-rm'), 1); saveCart(); updateBadges(); renderCart(); return; }
    if (t.hasAttribute('data-botcart')) {
      var bu = null;
      try { bu = siteOrderLink(); } catch (err) { bu = null; }
      if (!bu) { t.setAttribute('href', CONFIG.orderBot + '?start=' + botCartPayload()); track('бот/кошик', 'Бот для замовлень (кошик)'); return; } // звичайне посилання
      e.preventDefault();
      var bw = window.open(bu, '_blank'); // синхронно в обробнику кліку — не блокується
      if (bw) { try { bw.opener = null; } catch (err) {} } else location.href = bu;
      t.setAttribute('href', bu);
      return;
    }
    if (t.hasAttribute('data-copy')) { copyText(orderText()).then(function (ok) { toast(ok ? 'Текст замовлення скопійовано ✅' : 'Не вдалося скопіювати — виділіть текст нижче'); if (!ok) $('.preview').open = true; }); return; }
    if (t.hasAttribute('data-send')) {
      var tgu = CONFIG.orderTelegram + '?text=' + encodeURIComponent(orderText());
      window.open(tgu, '_blank', 'noopener');
      return;
    }
    if (t.hasAttribute('data-wa')) { window.open(CONFIG.whatsapp + '?text=' + encodeURIComponent(orderText()), '_blank', 'noopener'); return; }
    if (t.hasAttribute('data-viber')) { location.href = CONFIG.viber + '&draft=' + encodeURIComponent(orderText()); return; }
    if (t.hasAttribute('data-ig')) {
      copyText(orderText()).then(function (ok) { toast(ok ? 'Instagram не підставляє текст сам — він уже скопійований, просто вставте в чат ✅' : 'Відкрийте «Текст замовлення» і скопіюйте вручну'); if (!ok) $('.preview').open = true; });
      window.open(CONFIG.instagram, '_blank', 'noopener');
      return;
    }
    if (t.hasAttribute('data-share')) { window.open('https://t.me/share/url?url=' + encodeURIComponent('https://t.me/alex_bes_shoping') + '&text=' + encodeURIComponent(orderText()), '_blank', 'noopener'); return; }
    if (t.id === 'more') { renderMore(); return; }
    if (t.hasAttribute('data-brand')) {
      // brand logo cards: Meiji -> category, Palinal -> search across all Palinal categories
      e.preventDefault();
      var bq = t.getAttribute('data-brand-q') || '', bh = t.getAttribute('href') || '#/';
      $('#q').value = bq; state.q = bq;
      if ((location.hash || '#/') !== bh) history.pushState(null, '', bh);
      route();
      var res = $('.results'), hdr = $('.hdr');
      if (res) window.scrollTo({ top: Math.max(0, res.getBoundingClientRect().top + window.scrollY - (hdr ? hdr.offsetHeight : 0) - 12), behavior: 'smooth' });
      return;
    }
    if (t.hasAttribute('data-go-chips')) { e.preventDefault(); var to = t.getAttribute('data-go-chips') || '#/'; if (location.hash !== to && !(to === '#/' && location.hash === '')) location.hash = to; setTimeout(function () { var c = to === '#/' ? $('#chips') : ($('#restitle').parentElement || $('#restitle')), hd = $('.hdr'); if (c) window.scrollTo({ top: Math.max(0, c.getBoundingClientRect().top + window.scrollY - (hd ? hd.offsetHeight : 0) - 12), behavior: 'smooth' }); }, 80); return; }
    if (t.hasAttribute('data-focus-search')) { e.preventDefault(); if (location.hash !== '#/' && !/^#\/c\//.test(location.hash)) location.hash = '#/'; window.scrollTo({ top: 0, behavior: 'smooth' }); setTimeout(function () { $('#q').focus(); }, 250); return; }
  });
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.id === 'q') { state.q = t.value.trim(); renderGridSearch(); return; }
    if (t.hasAttribute('data-f')) { form[t.getAttribute('data-f')] = t.value; save('alexbes_form', form); var o = $('#otext'); if (o) o.textContent = orderText(); return; }
    if (t.hasAttribute('data-ci')) { var i = +t.getAttribute('data-ci'); cart[i].qty = Math.max(1, parseInt(t.value, 10) || 1); saveCart(); updateBadges(); var o2 = $('#otext'); if (o2) o2.textContent = orderText(); return; }
  });
  function renderGridSearch() {
    // search is global (all categories) like the reference; category chip resets to "all"
    if (state.q && state.cat !== 'all') { state.cat = 'all'; history.replaceState(null, '', '#/'); lastListHash = '#/'; }
    renderGrid();
    if (state.q && window.scrollY > $('#catalog').offsetTop + 200) $('#catalog').scrollIntoView({ behavior: 'smooth' });
  }
  $('#sort').addEventListener('change', function () { state.sort = this.value; renderGrid(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { hideModal(); return; }
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && openModalEl && openModalEl === $('#pmodal') && !/INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || '')) { galGo(e.key === 'ArrowLeft' ? -1 : 1, true); }
  });
  window.addEventListener('hashchange', route);

  /* ---------- Firebase bridge (js/fb.js is optional: if it never loads, everything above works from static data) ---------- */
  var BASE = {}; PRODUCTS.forEach(function (p) { BASE[p.id] = p; });
  var STATIC_ORDER = PRODUCTS.slice();
  var STATIC_IDX = {}; STATIC_ORDER.forEach(function (p, i) { STATIC_IDX[p.id] = i; });
  var EDITABLE = ['name', 'category', 'price_eur', 'price_label', 'in_stock', 'description', 'promo', 'variants', 'code', 'brand', 'gallery', 'videos'];
  function catName(id) { return catById[id] ? catById[id].name : id; }
  // docs: [{id, ...fields}] from Firestore products/{id}. Doc with a static id overrides that product's fields;
  // new ids are appended (sorted into their category); hidden:true removes the product from the public catalog.
  function applyRemote(docs) {
    var list = [], seen = {};
    STATIC_ORDER.forEach(function (bp) { list.push(bp); });
    (docs || []).forEach(function (d) { if (d && typeof d.id === 'string' && /^[\w-]{1,80}$/.test(d.id)) seen[d.id] = d; });
    var extra = Object.keys(seen).filter(function (id) { return !BASE[id]; }).map(function (id) { return seen[id]; });
    extra.sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
    var out = [];
    list.concat(extra).forEach(function (bp) {
      var d = seen[bp.id], p;
      if (BASE[bp.id]) p = Object.assign({}, BASE[bp.id]);
      else p = { id: bp.id, category: '', name: '', description: '', price_eur: null, price_label: null, variants: null, price_note: '', price_uah_original: null, source: [], photo: PLACEHOLDER, in_stock: 'Наявність уточнюйте', flag: null, code: '' };
      if (d) {
        EDITABLE.forEach(function (k) { if (d[k] !== undefined) p[k] = d[k]; });
        if (p.price_eur !== null && typeof p.price_eur !== 'number') p.price_eur = parseFloat(p.price_eur) || null;
        if (p.variants && !(Array.isArray(p.variants) && p.variants.length)) p.variants = null;
        if (p.price_label === '') p.price_label = null;
        p.hasPhoto = !!d.hasPhoto;
        if (d.hidden) return;
      }
      if (!catById[p.category]) { if (BASE[p.id]) p.category = BASE[p.id].category; else return; }
      p.category_name = catName(p.category);
      out.push(p);
    });
    PRODUCTS = out; byId = {}; index = {};
    PRODUCTS.forEach(function (p) { byId[p.id] = p; indexProduct(p); });
    CATS.forEach(function (c) { c.count = PRODUCTS.filter(function (p) { return p.category === c.id; }).length; });
    splitCart(allLines()); saveCart(true); updateBadges();
    renderCats();
    renderGrid(); cmpSync();
    if (openModalEl && openModalEl === $('#pmodal') && pmState.id) { if (byId[pmState.id]) renderProduct(); else hideModal(); }
    else if (openModalEl && openModalEl === $('#cmodal')) renderCart();
    else if (openModalEl && openModalEl === $('#cmpmodal')) renderCompare();
    else if (!openModalEl) { var hm = (location.hash || '').match(/^#\/p\/([\w-]+)/); if (hm && byId[hm[1]]) openProduct(hm[1]); } // link to a product that only exists in Firestore
  }
  var photoLoader = null, photoReq = {};
  function fillPhotos() {
    if (!photoLoader) return;
    $$('img[data-ph]').forEach(function (img) {
      var id = img.getAttribute('data-ph');
      if (photoData[id]) { img.src = photoData[id]; img.removeAttribute('data-ph'); return; }
      if (photoReq[id]) return;
      photoReq[id] = Promise.resolve().then(function () { return photoLoader(id); }).then(function (url) {
        if (typeof url === 'string' && /^data:image\//.test(url)) {
          photoData[id] = url;
          $$('img[data-ph="' + id + '"]').forEach(function (im) { im.src = url; im.removeAttribute('data-ph'); });
        }
      }, function () { delete photoReq[id]; });
    });
  }
  window.AlexBes = {
    applyRemote: applyRemote,
    setPhotoLoader: function (fn) { photoLoader = fn; fillPhotos(); },
    getCart: allLines,
    setCart: function (lines) { splitCart(lines); saveCart(true); updateBadges(); if (openModalEl && openModalEl === $('#cmodal')) renderCart(); },
    onCartChange: function (fn) { cartListeners.push(fn); },
    getForm: function () { return Object.assign({}, form); },
    setOrderWriter: function (fn) { orderWriter = typeof fn === 'function' ? fn : null; },
    setStatWriter: function (fn) { statWriter = typeof fn === 'function' ? fn : null; if (statWriter) { var q = statQ; statQ = []; q.forEach(function (x) { statSend(x[0], x[1]); }); } },
    fillForm: function (f) { var ch = false; ['name', 'phone', 'city'].forEach(function (k) { if (f[k] && !form[k]) { form[k] = f[k]; ch = true; } }); if (ch) { save('alexbes_form', form); if (openModalEl && openModalEl === $('#cmodal')) renderCart(); } },
    showModal: function (sel) { showModal(sel); },
    hideModal: hideModal,
    toast: function (m) { toast(m); },
    track: track,
    gunSpecs: function (id) { return byId[id] ? gunSpecs(byId[id]) : null; }
  };
  // last known Firestore overrides (no photos) — applied instantly so hidden/edited items don't flash; refreshed by js/fb.js
  try { var cachedRemote = load('alexbes_remote', null); if (cachedRemote && Array.isArray(cachedRemote.docs)) applyRemote(cachedRemote.docs); } catch (e) {}

  /* ---------- init ---------- */
  renderCats(); updateBadges(); cmpSync();
  stat('views'); // візит: раз за сесію вкладки на добу
  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver(function (en) { if (en[0].isIntersecting && shown < curList.length) renderMore(); }, { rootMargin: '600px 0px' });
    io.observe($('#more'));
  }
  var upd = $('#upd'); if (upd) upd.textContent = new Date(DATA.updated || Date.now()).toLocaleDateString('uk-UA');
  route();
})();
