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
    titleName: 'Alex_bes', // 08.10: назва в <title> (без емодзі); siteName лишається в тексті замовлень
    homeTitle: 'Фарбопульти Meiji, SATA і автофарби PALINAL | Alex_bes, Чернівці',
    uahRate: 52 // фіксований курс: ціни зберігаються в € (price_eur), на сайті показуються в гривнях = € × uahRate
  };
  var DATA = window.ALEXBES_DATA || { categories: [], products: [] };
  // 08.10.2026: hidden:true у products.json — товар прихований за замовчуванням (адмінка може показати: products/{id}.hidden = false)
  var ALL_STATIC = DATA.products, PRODUCTS = ALL_STATIC.filter(function (p) { return !p.hidden; }), CATS = DATA.categories;
  CATS.forEach(function (c) { c.count = PRODUCTS.filter(function (p) { return p.category === c.id; }).length; }); // лише видимі
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

  var state = { cat: 'all', q: '', sort: 'def', brand: '', sub: '' };
  /* усі фарбопульти й пістолети — один розділ «guns»; старі розділи (посилання #/c/meiji тощо) ведуть туди ж, Meiji/SATA — фільтром бренду */
  var CAT_ALIAS = { meiji: ['guns', 'meiji'], sata: ['guns', 'sata'], china: ['cn', ''], guns2: ['guns', ''], putty: ['shpak', ''],
    lak: ['palinal', 'lak'], emal2k: ['palinal', 'emal2k'], baza: ['palinal', 'baza'], grunt: ['palinal', 'grunt'], rozch: ['palinal', 'rozch'], // 04.10: усі PALINAL (крім шпаклівок) — один розділ
    acc: ['equip', ''], tools: ['equip', 'tools'], ppe: ['equip', 'ppe'],
    cloth: ['polish', 'cloth'], seal: ['chem', 'seal'] }; // 04.10: мікрофібра → «Полірування та догляд», герметики → «Автохімія та герметики» // 04.10: аксесуари + інструмент + захист — один розділ «equip»
  /* об’єднані картки: старе посилання #/p/<id> веде на нову */
  var PROD_ALIAS = { '3m-trizact-foam-8000': '3m-trizact-50341', 'pal-fast-air': 'pal-873-fast' };
  var GUN_BRANDS = [{ k: 'meiji', t: 'Meiji', re: /meiji/i }, { k: 'sata', t: 'SATA', re: /sata/i }, { k: 'ntools', t: 'NTools', re: /ntools/i }, { k: 'italco', t: 'ITALCO', re: /italco/i }, { k: 'auarita', t: 'Auarita', re: /auarita/i }, { k: 'other', t: 'Інші', re: null }];
  function gunBrand(p) { var s = (p.brand || '') + ' ' + p.name; for (var i = 0; i < GUN_BRANDS.length - 1; i++) if (GUN_BRANDS[i].re.test(s)) return GUN_BRANDS[i].k; return 'other'; }
  /* 04.10: підрозділи (чипи) всередині розділу: PALINAL — за типом товару; фарбопульти — за типом (+ фільтр бренду) */
  var GUN_MINI = /міні|mini|spot|\b0\.8\b/i;
  var SUBCATS = {
    palinal: { label: 'Розділ', items: [
      { k: 'emal2k', t: '2K автоемалі', f: function (p) { return p.sub === 'emal2k'; } },
      { k: 'baza', t: 'Базові фарби', f: function (p) { return p.sub === 'baza'; } },
      { k: 'lak', t: 'Лаки', f: function (p) { return p.sub === 'lak'; } },
      { k: 'grunt', t: 'Ґрунти', f: function (p) { return p.sub === 'grunt'; } },
      { k: 'rozch', t: 'Розчинники', f: function (p) { return p.sub === 'rozch' && /розчинник|thinner/i.test(p.name); } },
      { k: 'antisil', t: 'Антисилікони', f: function (p) { return p.sub === 'rozch' && /антисилікон/i.test(p.name) && !/добавк/i.test(p.name); } },
      { k: 'dobavky', t: 'Добавки', f: function (p) { return p.sub === 'rozch' && !/розчинник|thinner|каталог/i.test(p.name) && !(/антисилікон/i.test(p.name) && !/добавк/i.test(p.name)); } },
      { k: 'system', t: 'Змішувальні системи та каталог', f: function (p) { return p.sub === 'system' || (p.sub === 'rozch' && /каталог/i.test(p.name)); } }
    ] },
    equip: { label: 'Розділ', items: [
      { k: 'gauge', t: 'Манометри та регулятори', f: function (p) { return eqType(p) === 'gauge'; } },
      { k: 'pps', t: 'PPS-системи та бачки', f: function (p) { return eqType(p) === 'pps'; } },
      { k: 'gunacc', t: 'Аксесуари для фарбопульта', f: function (p) { return eqType(p) === 'gunacc'; } },
      { k: 'equipment', t: 'Обладнання', f: function (p) { return eqType(p) === 'equipment'; } },
      { k: 'tools', t: 'Інструмент', f: function (p) { return eqType(p) === 'tools'; } },
      { k: 'ppe', t: 'Засоби захисту', f: function (p) { return eqType(p) === 'ppe'; } }
    ] },
    polish: { label: 'Розділ', items: [
      { k: 'paste', t: 'Полірувальні пасти', f: function (p) { return plType(p) === 'paste'; } },
      { k: 'pads', t: 'Полірувальні круги', f: function (p) { return plType(p) === 'pads'; } },
      { k: 'care', t: 'Догляд і захист', f: function (p) { return plType(p) === 'care'; } },
      { k: 'cloth', t: 'Мікрофібра та серветки', f: function (p) { return plType(p) === 'cloth'; } }
    ] },
    chem: { label: 'Розділ', items: [
      { k: 'seal', t: 'Герметики та клеї', f: function (p) { return chType(p) === 'seal'; } },
      { k: 'antikor', t: 'Антикор і антигравій', f: function (p) { return chType(p) === 'antikor'; } },
      { k: 'additive', t: 'Добавки та змивки', f: function (p) { return chType(p) === 'additive'; } }
    ] },
    // 08.10.2026: «Товари з Китаю» (cn) — тип з даних (merge_guns.py: p.type 'guns' / 'equip')
    cn: { label: 'Тип', items: [
      { k: 'guns', t: 'Фарбопульти та пістолети', f: function (p) { return p.type === 'guns'; } },
      { k: 'equip', t: 'Обладнання та аксесуари', f: function (p) { return p.type !== 'guns'; } }
    ] },
    guns: { label: 'Тип', items: [
      { k: 'spray', t: 'Фарбопульти', f: function (p) { return p.sub !== 'air' && !GUN_MINI.test(p.name); } },
      { k: 'mini', t: 'Міні-фарбопульти', f: function (p) { return p.sub !== 'air' && GUN_MINI.test(p.name); } },
      { k: 'special', t: 'Спеціальні пістолети', f: function (p) { return p.sub === 'air'; } }
    ] }
  };
  /* тип у розділі «equip»: p.type з даних (merge_guns.py); для товарів, доданих в адмінці, — за назвою */
  function eqType(p) {
    if (p.type) return p.type;
    var n = (p.name || '').toLowerCase();
    if (p.sub === 'ppe') return 'ppe';
    if (/манометр|регулятор/.test(n)) return 'gauge';
    if (/pps|бачок/.test(n)) return 'pps';
    if (/дюз|фарбопульт/.test(n)) return 'gunacc';
    if (/пінник|помп|мийк|фільтр|компресор/.test(n)) return 'equipment';
    return 'tools';
  }
  /* типи в розділах «polish» і «chem»: p.type з даних (merge_guns.py); для товарів з адмінки — за назвою */
  function plType(p) {
    if (p.type) return p.type;
    var n = (p.name || '').toLowerCase();
    if (p.sub === 'cloth') return 'cloth';
    if (/круг/.test(n)) return 'pads';
    if (/віск|поліроль|очищувач|wax|glaze|remover/.test(n)) return 'care';
    return 'paste';
  }
  function chType(p) {
    if (p.type) return p.type;
    var n = (p.name || '').toLowerCase();
    if (p.sub === 'seal' || /герметик|клей/.test(n)) return 'seal';
    if (/антиграв|ірж|антикор/.test(n)) return 'antikor';
    return 'additive';
  }
  function subItem(cat, k) { var s = SUBCATS[cat]; if (!s || !k) return null; for (var i = 0; i < s.items.length; i++) if (s.items[i].k === k) return s.items[i]; return null; }
  function subName(cat, k) { var it = subItem(cat, k); return it ? it.t : ''; }
  function catHash(cat, sub, brand) { return '#/c/' + cat + (sub ? '/' + sub : '') + (brand ? '/' + brand : ''); }
  function inCats(p, arr) { return arr.indexOf(p.category) >= 0 || (!!p.sub && arr.indexOf(p.sub) >= 0); }
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
  // 08.10.2026: синхронізація «Ім’я / Телефон / Місто / доставка» з профілем акаунта (слухача ставить js/fb.js; для гостя — нічого)
  var formListener = null;
  function formChanged(kind) { if (formListener) { try { formListener({ name: form.name || '', phone: form.phone || '', city: form.city || '' }, kind); } catch (e) {} } }
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
  /* ---------- знижки (08.10.2026): стара ціна перекреслена + «−N%» ----------
     price_eur = поточна (нова) ціна, price_old_eur = стара (у товару й у кожного варіанта); показуємо стару, лише якщо вона
     більша за нову. Нова = стара (грн) × (100 − N) / 100, округлено вниз до гривні (так само _work/discount.py, js/admin.js). */
  function oldOf(o) {
    if (!o || o.price_old_eur == null || o.price_eur == null) return null;
    var a = Number(o.price_old_eur);
    return isFinite(a) && a > 0 && toUah(a) > toUah(o.price_eur) ? a : null;
  }
  function unitOld(p, vi) { var v = variantOf(p, vi); return oldOf(v || p); }
  function hasDisc(p) { return !!(oldOf(p) || (p.variants || []).some(oldOf)); }
  function discPct(old, now) { var a = toUah(old), b = toUah(now); return a > 0 ? Math.round((1 - b / a) * 100) : 0; }
  function discEur(old, pct) { var n = Math.floor(toUah(old) * (100 - pct) / 100); return Math.round(n / CONFIG.uahRate * 1e4) / 1e4; }
  // стара ціна + бейдж; cls: модифікатор розміру (pold--pm у картці товару, pold--sm у списках)
  function oldHTML(old, now, cls) {
    if (old == null || now == null) return '';
    return '<span class="pold' + (cls ? ' ' + cls : '') + '"><s aria-label="Стара ціна">' + uah(old) + '</s><span class="pdisc">\u2212' + discPct(old, now) + '%</span></span>';
  }
  // правки адмінки, збережені ДО появи знижок (є price_eur/variants, немає ключа price_old_eur): якщо товар має знижку
  // в каталозі (disc_pct), ціна з адмінки = стара, знижку застосовуємо до неї. Є ключ price_old_eur — адмінка керує сама.
  function discNorm(bp, d) {
    var pct = bp && bp.disc_pct;
    if (!pct || !d || d.price_old_eur !== undefined || (d.price_eur === undefined && d.variants === undefined)) return d;
    d = Object.assign({}, d);
    if (d.price_eur !== undefined) {
      var pe = d.price_eur == null ? null : parseFloat(d.price_eur);
      if (pe == null || !isFinite(pe)) d.price_old_eur = null; else { d.price_old_eur = pe; d.price_eur = discEur(pe, pct); }
    }
    if (Array.isArray(d.variants)) d.variants = d.variants.map(function (v) {
      if (!v || v.price_eur == null || v.price_old_eur != null) return v;
      return Object.assign({}, v, { price_old_eur: v.price_eur, price_eur: discEur(v.price_eur, pct) });
    });
    return d;
  }
  function pillHTML(p, cls) {
    if (!hasPrice(p)) return '<span class="pill pill--ask">Ціну уточнюйте</span>';
    // «від» лише коли ціни варіантів різні (08.10: однакова ціна для всіх кольорів — без «від»)
    var from = p.variants && p.variants.length > 1 && new Set(p.variants.map(function (v) { return v && v.price_eur != null ? uah(v.price_eur) : '-'; })).size > 1 ? '<small>від</small>' : '';
    var old = oldOf(p);
    var pill = '<span class="pill' + (old != null ? ' pill--sale' : '') + '">' + from + uah(p.price_eur) + '</span>';
    return old != null ? '<span class="pbox' + (cls ? ' ' + cls : '') + '">' + pill + oldHTML(old, p.price_eur) + '</span>' : pill;
  }
  var PLACEHOLDER = 'img/logo.webp?v=3';
  var photoData = {}; // id -> data URL loaded from Firestore photos/{id}
  // gallery: ordered photo keys from Firestore — 'static' = catalog photo (img/p), 'main' = photos/{id}, other = photos/{id}__{key}
  function galleryOf(p) {
    var g = Array.isArray(p.gallery) ? p.gallery : (p.hasPhoto ? ['main'] : (p.photo ? ['static'] : []));
    var out = [];
    g.forEach(function (k) {
      if (typeof k !== 'string' || out.length >= 10) return;
      if (k === 'static') {
        var bp = BASE[p.id] || p, st = bp.photo; if (st) out.push({ src: st });
        // photos_extra: additional static catalog photos (img/p/...) shown after the main one
        (Array.isArray(bp.photos_extra) ? bp.photos_extra : []).forEach(function (x) { if (typeof x === 'string' && /^img\//.test(x) && out.length < 10) out.push({ src: x }); });
      }
      else if (/^[\w-]{1,40}$/.test(k)) out.push({ doc: k === 'main' ? p.id : p.id + '__' + k });
    });
    return out;
  }
  // 400 px копії фото каталогу (img/t/…, _work/make_thumbs.py) для карток і каруселей: srcset, браузер сам бере 800 px, коли треба
  function thumbOf(src) { return /^img\/[pv]\/[^/]+\.webp(\?|$)/.test(src) ? 'img/t/' + src.slice(4) : null; }
  function imgAttrs(p, g, sizes) {
    if (!g) return 'src="' + PLACEHOLDER + '"';
    var th = sizes && g.src && thumbOf(g.src);
    if (th) return 'src="' + esc(th) + '" srcset="' + esc(th) + ' 400w, ' + esc(g.src) + ' 800w" sizes="' + sizes + '"';
    if (g.src) return 'src="' + esc(g.src) + '"';
    return photoData[g.doc] ? 'src="' + photoData[g.doc] + '"' : 'src="' + (p.photo || PLACEHOLDER) + '" data-ph="' + esc(g.doc) + '"';
  }
  function mainImg(p, sizes) { return imgAttrs(p, galleryOf(p)[0], sizes); }
  var SZ_CARD = '(max-width:760px) 48vw, 300px', SZ_SM = '200px';
  function stockHTML(p) {
    var s = p.in_stock || '';
    var cls = /немає/i.test(s) ? ' stock--out' : /наявн/i.test(s) && !/уточн/i.test(s) ? '' : /дороз|замовл/i.test(s) ? ' stock--way' : ' stock--ask';
    return '<span class="stock' + cls + '">' + esc(s) + '</span>';
  }

  /* ---------- category line icons (24×24, stroke) ---------- */
  var CAT_IC = {
    all: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>',
    sale: '<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m15 9-6 6"/><path d="M9 9h.01"/><path d="M15 15h.01"/>',
    'new': '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15.5l.8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8z"/>',
    excl: '<path d="M6.5 4h11l3.5 5-9 11L3 9z"/><path d="M3 9h18"/><path d="M9.5 4 8 9l4 11 4-11-1.5-5"/>',
    pdr: '<path d="M3 15.5c2-3.2 5-4.8 9-4.8s7 1.6 9 4.8"/><path d="M3 19.5h18"/><path d="M12 10.7V4.5"/><path d="M9.5 4.5h5"/><path d="M9.2 13.4c.8-.4 1.8-.6 2.8-.6s2 .2 2.8.6"/>',
    cn: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.4 2.3 3.6 5.1 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.1-3.6-8.5s1.2-6.2 3.6-8.5z"/>',
    fav: '<path d="M12 20.3s-7.4-4.5-9.1-9.3C1.7 7.5 4 4.5 7.4 4.5c1.9 0 3.5 1 4.6 2.7 1.1-1.7 2.7-2.7 4.6-2.7 3.4 0 5.7 3 4.5 6.5-1.7 4.8-9.1 9.3-9.1 9.3z"/>',
    guns: '<path d="M4 7h11.5a2.5 2.5 0 0 1 2.5 2.5V11h-4l-1.2 2.2H9.5L8.4 20H5l1.2-7H4z"/><path d="M18 9h2.5M10 4h3.5v3"/>',
    equip: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M9 8V6.5A1.5 1.5 0 0 1 10.5 5h3A1.5 1.5 0 0 1 15 6.5V8"/><path d="M3 13.5h18"/><path d="M10.5 12.5v2h3v-2"/>',
    acc: '<circle cx="12" cy="13" r="7.5"/><path d="M12 13l3.2-3.2"/><path d="M8.2 17h7.6"/><path d="M12 5.5V3M10 3h4"/>',
    palinal: '<path d="M12 3.2s6 6.4 6 10.8a6 6 0 0 1-12 0c0-4.4 6-10.8 6-10.8z"/><path d="M9.2 14.6a2.9 2.9 0 0 0 2.8 2.4"/>',
    lak: '<path d="M12 3.2s6 6.4 6 10.8a6 6 0 0 1-12 0c0-4.4 6-10.8 6-10.8z"/><path d="M9.2 14.6a2.9 2.9 0 0 0 2.4 2.6"/>',
    emal2k: '<path d="M5 7.5h14v11a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 18.5z"/><path d="M5 7.5 6.5 4h11L19 7.5"/><path d="M9 12.5h6"/>',
    baza: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.4-1.2-1.6-1.2-2.8 0-1 .8-1.6 1.8-1.6H17a3.5 3.5 0 0 0 3.5-3.5c0-4.1-3.8-7.4-8.5-7.4z"/><circle cx="7.6" cy="11" r="1"/><circle cx="10.4" cy="7.4" r="1"/><circle cx="15" cy="7.8" r="1"/>',
    grunt: '<path d="M12 3.5 3 8l9 4.5L21 8z"/><path d="m3 12 9 4.5 9-4.5"/><path d="m3 16 9 4.5 9-4.5"/>',
    shpak: '<path d="M4 20l6.2-6.2"/><path d="M9 12.5 15.5 6a2.1 2.1 0 0 1 3 0l-.1-.1a2.1 2.1 0 0 1 0 3L12 15.5z"/><path d="M14 19.5h6.5"/>',
    putty: '<path d="M4 13.5h16l-1.6 6.5H5.6z"/><path d="M9.5 13.5V6a2.5 2.5 0 0 1 5 0v7.5"/><path d="M8 17h8"/>',
    rozch: '<path d="M9.5 3.5h5"/><path d="M10.5 3.5v5.2L5.2 18a1.8 1.8 0 0 0 1.6 2.6h10.4a1.8 1.8 0 0 0 1.6-2.6l-5.3-9.3V3.5"/><path d="M7.5 14.5h9"/>',
    savex: '<path d="M9 2.8h6"/><path d="M10 2.8v3.4h4V2.8"/><path d="M8.2 6.2h7.6a1.7 1.7 0 0 1 1.7 1.7v11.6a1.7 1.7 0 0 1-1.7 1.7H8.2a1.7 1.7 0 0 1-1.7-1.7V7.9a1.7 1.7 0 0 1 1.7-1.7z"/><path d="M6.5 11h11M6.5 16.5h11"/>',
    abraz: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="6.8" r=".6"/><circle cx="17.2" cy="12" r=".6"/><circle cx="12" cy="17.2" r=".6"/><circle cx="6.8" cy="12" r=".6"/><circle cx="15.7" cy="8.3" r=".6"/><circle cx="8.3" cy="15.7" r=".6"/><circle cx="8.3" cy="8.3" r=".6"/><circle cx="15.7" cy="15.7" r=".6"/>',
    polish: '<ellipse cx="11" cy="15.5" rx="7.5" ry="3"/><path d="M3.5 15.5v1.5c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-1.5"/><path d="M11 12.5V8"/><path d="M8.5 8h5"/><path d="M18.5 3.5l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7z"/>',
    mask: '<circle cx="10" cy="11" r="6.5"/><circle cx="10" cy="11" r="2.5"/><path d="M16.5 11v8.5H21"/><path d="M10 17.5h6.5"/>',
    chem: '<path d="M8.5 3.5h7"/><path d="M9.5 3.5v6.2l-4 7.3a2.3 2.3 0 0 0 2 3.5h9a2.3 2.3 0 0 0 2-3.5l-4-7.3V3.5"/><circle cx="10.5" cy="16" r=".7"/><circle cx="13.8" cy="14" r=".7"/>',
    seal: '<path d="M7 9.5h9.5v10a1.5 1.5 0 0 1-1.5 1.5H8.5A1.5 1.5 0 0 1 7 19.5z"/><path d="M8.5 9.5 10 6h3.5l1.5 3.5"/><path d="M11.75 6V2.8"/><path d="M7 13.5h9.5"/>',
    cloth: '<path d="M4 6.5c2.7-1.6 5.3 1.6 8 0s5.3 1.6 8 0v11c-2.7 1.6-5.3-1.6-8 0s-5.3-1.6-8 0z"/><path d="M4 12c2.7-1.6 5.3 1.6 8 0s5.3 1.6 8 0"/>',
    ppe: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8 7.5 9.5 4.3-1.5 7.5-4.9 7.5-9.5V6z"/><path d="m8.8 12 2.2 2.2 4.3-4.4"/>',
    tools: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>'
  };
  function catIc(id, sz) { return '<span class="cic">' + svgI(CAT_IC[id] || CAT_IC.all, sz || 20) + '</span>'; }
  var CAT_LABEL = { sale: 'Акції', 'new': 'Новинки', excl: 'Ексклюзив', fav: 'Вибране' };
  function catLabel(id) { return CAT_LABEL[id] || (id === 'all' ? '' : catById[id] ? catById[id].name : id); }
  function countWord(n) { var a = n % 10, b = n % 100; return n + ' ' + (a === 1 && b !== 11 ? 'товар' : a >= 2 && a <= 4 && (b < 12 || b > 14) ? 'товари' : 'товарів'); }
  /* головна: блок «Категорії» — плитки з іконкою, назвою і кількістю (на мобільному — сітка #chips) */
  function renderHomeCats() {
    var el = $('#cattiles'); if (!el) return;
    el.querySelector('.ctiles').innerHTML = CATS.filter(function (c) { return c.count > 0; }).map(function (c) {
      return '<li><a class="ctile" href="#/c/' + c.id + '" data-cat-tile="' + c.id + '">' + catIc(c.id, 24) +
        '<span class="ctile__t"><b>' + esc(c.name) + '</b><small>' + countWord(c.count) + '</small></span>' +
        '<span class="ctile__go" aria-hidden="true">' + svgI('<path d="M9 6l6 6-6 6"/>', 16) + '</span></a></li>';
    }).join('');
  }
  /* підрозділи (#subbar) і фільтр бренду фарбопультів (#brandbar) */
  function renderBrandBar() {
    var sb = $('#subbar'), el = $('#brandbar');
    var sc = SUBCATS[state.cat];
    if (sb) {
      if (!sc || state.q) sb.hidden = true;
      else {
        var inCat = PRODUCTS.filter(function (p) { return p.category === state.cat && (state.cat !== 'guns' || !state.brand || gunBrand(p) === state.brand); });
        var subs = [{ k: '', t: 'Усі', n: inCat.length }].concat(sc.items.map(function (s) { return { k: s.k, t: s.t, n: inCat.filter(s.f).length }; }).filter(function (s) { return s.n > 0 || s.k === state.sub; }));
        sb.innerHTML = '<span class="bbar__l">' + esc(sc.label) + '</span>' + subs.map(function (s) {
          return '<a class="bbar__b' + (state.sub === s.k ? ' on' : '') + '" href="' + catHash(state.cat, s.k, state.cat === 'guns' ? state.brand : '') + '"' + (state.sub === s.k ? ' aria-current="true"' : '') + '>' + esc(s.t) + '<small>' + s.n + '</small></a>';
        }).join('');
        sb.hidden = false; barToOn(sb);
      }
    }
    if (!el) return;
    if (state.cat !== 'guns' || state.q) { el.hidden = true; return; }
    var si = subItem('guns', state.sub);
    var all = PRODUCTS.filter(function (p) { return p.category === 'guns' && (!si || si.f(p)); });
    var items = [{ k: '', t: 'Усі', n: all.length }].concat(GUN_BRANDS.map(function (b) { return { k: b.k, t: b.t, n: all.filter(function (p) { return gunBrand(p) === b.k; }).length }; }).filter(function (b) { return b.n > 0 || b.k === state.brand; }));
    el.innerHTML = '<span class="bbar__l">Бренд</span>' + items.map(function (b) {
      return '<a class="bbar__b' + (state.brand === b.k ? ' on' : '') + '" href="' + catHash('guns', state.sub, b.k) + '"' + (state.brand === b.k ? ' aria-current="true"' : '') + '>' + esc(b.t) + '<small>' + b.n + '</small></a>';
    }).join('');
    el.hidden = false; barToOn(el);
  }
  function barToOn(bar) { var on = bar.querySelector('.on'); if (on && bar.scrollWidth > bar.clientWidth) bar.scrollLeft = Math.max(0, on.offsetLeft - bar.offsetLeft - 16); } // мобільний: обраний чип — у полі зору

  /* ---------- catalog render ---------- */
  function renderCats() {
    var total = PRODUCTS.length;
    var items = [{ id: 'all', name: 'Усі товари', count: total }, { id: 'sale', name: 'Акції', count: PRODUCTS.filter(isSale).length }, { id: 'new', name: 'Новинки', count: PRODUCTS.filter(isNew).length }];
    // 08.10.2026 (Alex): замість розділу «Ексклюзив» — «Товари з Китаю» на тому ж місці (позначки «Ексклюзив» на картках лишаються)
    var cn = CATS.filter(function (c) { return c.id === 'cn' && c.count > 0; })[0];
    if (cn) items.push(cn);
    var nf = favList().length; // «Вибране (N)» — лише коли N > 0 (або коли його зараз відкрито)
    if (nf || state.cat === 'fav') items.push({ id: 'fav', name: 'Вибране', count: nf });
    items = items.concat(CATS.filter(function (c) { return c.id !== 'cn' && c.count > 0; })); // порожні (усі товари приховані) розділи не показуємо
    var nm = function (c, short) { return esc(short && c.id === 'all' ? 'Усі товари' : c.name); };
    $('#catlist').innerHTML = items.map(function (c) {
      return '<li><a href="' + (c.id === 'all' ? '#/' : '#/c/' + c.id) + '" data-cat="' + c.id + '">' + catIc(c.id, 18) + '<span class="side__nm">' + nm(c) + '</span><span class="n">' + c.count + '</span></a></li>';
    }).join('');
    // 04.10: у мобільній сітці категорій без «Акцій» і «Новинок» (акції — вкладка нижнього меню й банер; у бічному меню на ПК лишаються)
    $('#chips').innerHTML = items.filter(function (c) { return c.id !== 'sale' && c.id !== 'new'; }).map(function (c) {
      return '<a class="chip" role="tab" href="' + (c.id === 'all' ? '#/' : '#/c/' + c.id) + '" data-cat="' + c.id + '">' + catIc(c.id, 18) + '<span class="chip__nm">' + nm(c, true) + '</span><small>' + c.count + '</small></a>';
    }).join('');
    renderHomeCats();
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
      else if (state.cat === 'excl') { if (!isExcl(p)) return false; }
      else if (state.cat === 'fav') { if (!isFav(p.id)) return false; }
      else if (state.cat !== 'all' && p.category !== state.cat) return false;
      if (state.cat === 'guns' && state.brand && !state.q && gunBrand(p) !== state.brand) return false;
      if (state.sub && !state.q) { var si = subItem(state.cat, state.sub); if (si && !si.f(p)) return false; }
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
    } else if (state.cat !== 'all') { // 04.10: у всіх розділах — від найдорожчого до найдешевшого (раніше лише фарбопульти)
      list.forEach(function (p, i) { p._i = i; });
      list.sort(function (a, b) { if (oos(a) !== oos(b)) return oos(a) - oos(b); var x = pr(a), y = pr(b); if (x == null && y == null) return a._i - b._i; if (x == null) return 1; if (y == null) return -1; return (y - x) || a._i - b._i; });
    } else {
      list.forEach(function (p, i) { p._i = i; });
      list.sort(function (a, b) { return oos(a) - oos(b) || order[a.category] - order[b.category] || a._i - b._i; });
    }
    return list;
  }
  var PROMO = { 'meiji-finer-core-liberty-walk': 'Новинка · Ексклюзив', 'meiji-finer-core-black': 'Ексклюзив', 'ntools-5000b-upgrades': 'Новинка', 'ntools-te20': 'Новинка', 'spi-pro-te20-sticker-bomb': 'Новинка', 'ntools-mini-5002': 'Новинка', 'sata-jet-x-pro': 'Акція', 'antistatic-easy-paint': 'ХІТ' };
  function promoOf(p) { return p.promo != null ? p.promo : PROMO[p.id]; }
  // позначка може бути: 'Акція' / 'ХІТ' / 'Новинка' / 'Ексклюзив' / свій текст, комбінації через ' · ' ('Новинка · Ексклюзив')
  // або короткі коди з адмінки через '+' ('new+excl', 'sale+excl', 'hit+excl', 'excl') — ліміт поля promo у Firestore 20 символів
  var PROMO_CODE = { new: 'Новинка', 'новинка': 'Новинка', sale: 'Акція', 'акція': 'Акція', hit: 'ХІТ', 'хіт': 'ХІТ', excl: 'Ексклюзив', 'ексклюзив': 'Ексклюзив' };
  function promoTags(p) {
    var t = promoOf(p); if (!t) return [];
    var out = [], ex = false;
    String(t).split(/\s*(?:·|\+)\s*/).forEach(function (x) {
      if (!x) return; var k = PROMO_CODE[x.toLowerCase()] || x;
      if (k === 'Ексклюзив') ex = true; else if (out.indexOf(k) < 0) out.push(k);
    });
    if (ex) out.push('Ексклюзив'); // «Ексклюзив» завжди другою позначкою (під основною)
    return out;
  }
  function promoText(p) { return promoTags(p).join(' · '); }
  function hasTag(p, re) { return promoTags(p).some(function (x) { return re.test(x); }); }
  function isSale(p) { return hasTag(p, /акці/i) || hasDisc(p); } // «Акції»: позначка «Акція» (каталог/адмінка) або знижка зі старою ціною (08.10)
  function isNew(p) { return hasTag(p, /новинк/i); }
  function isExcl(p) { return hasTag(p, /ексклюзив/i); } // окремий розділ «Ексклюзив» (незалежно від «Новинки»)
  // діамант для позначки «Ексклюзив»: SVG-грані холодного кольору; обертання/світіння — у CSS (.promo__gem)
  var GEM = '<span class="promo__gem" aria-hidden="true"><span class="promo__gem-glow"></span><span class="promo__gem-in"><svg viewBox="0 0 24 20" width="24" height="20" focusable="false">' +
    '<path d="M6 1h12l-3 6H9z" fill="#f2feff"/><path d="M6 1 0 7h9z" fill="#c4f4ff"/><path d="M18 1l6 6h-9z" fill="#9fe9ff"/>' +
    '<path d="M0 7h9l3 12z" fill="#6fd8f7"/><path d="M9 7h6l-3 12z" fill="#dffaff"/><path d="M15 7h9L12 19z" fill="#43bfe8"/>' +
    '<path d="M6 1h12l6 6-12 12L0 7z" fill="none" stroke="#ffffff" stroke-opacity=".75" stroke-width=".7" stroke-linejoin="round"/></svg></span></span>';
  function promoHTML(p) {
    var tg = promoTags(p); if (!tg.length) return '';
    return tg.map(function (x, i) { // кілька позначок: 'Новинка · Ексклюзив' — друга під першою
      var n2 = i ? ' promo--n' + (i + 1) : '';
      if (x === 'ХІТ') return '<span class="promo promo--hit' + n2 + '"><svg class="ico" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M11.53 2.3a.53.53 0 0 1 .95 0l2.31 4.68a2.12 2.12 0 0 0 1.6 1.16l5.16.76a.53.53 0 0 1 .3.9l-3.74 3.64a2.12 2.12 0 0 0-.61 1.88l.88 5.14a.53.53 0 0 1-.77.56l-4.62-2.43a2.12 2.12 0 0 0-1.97 0L6.4 21.01a.53.53 0 0 1-.77-.56l.88-5.14a2.12 2.12 0 0 0-.61-1.88L2.16 9.8a.53.53 0 0 1 .3-.91l5.16-.75a2.12 2.12 0 0 0 1.6-1.16z"/></svg> ' + x + '</span>';
      if (/новинк/i.test(x)) return '<span class="promo promo--new' + n2 + '">Новинка</span>';
      if (/ексклюзив/i.test(x)) return '<span class="promo promo--excl' + n2 + '" aria-label="Ексклюзив"><span class="promo__xt">Ексклюзив</span>' + GEM + '</span>'; // золотий неон + діамант, що крутиться
      return '<span class="promo' + n2 + '"><svg class="ico" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg> ' + esc(x) + '</span>';
    }).join('');
  }
  // опис у картці товару: «Лімітована серія — …!» на початку — виділяємо окремим рядком
  function pmDesc(d) {
    var t = uahText(d || ''), m = t.match(/^(Лімітована серія[^!]*!)\s*/);
    return m ? '<strong class="pm__ltd">' + esc(m[1]) + '</strong>' + esc(t.slice(m[0].length)) : esc(t);
  }
  function cardHTML(p, i) {
    var eager = i < 8 ? 'eager' : 'lazy';
    return '<li class="card"><div class="card__in">' +
      '<div class="card__media"><button class="card__img is-ld" type="button" data-open="' + p.id + '" aria-label="' + esc(p.name) + '"><img ' + mainImg(p, SZ_CARD) + ' alt="' + esc(p.name) + '" loading="' + eager + '" decoding="async" width="400" height="400">' + promoHTML(p) + (spinOf(p) ? '<span class="spinb" title="Є обертання 360°">' + SPIN_IC + '360°</span>' : '') + '</button>' +
      '<button class="card__add" type="button" data-add="' + p.id + '" aria-label="Додати «' + esc(p.name) + '» в кошик">+</button>' + favBtnHTML(p, 'favb--card') + '</div>' +
      '<div class="card__body">' +
        '<span class="card__cat">' + esc(p.category_name) + (p.tds ? ' <span class="tdsb" title="Є технічні дані (ТДС)">ТДС</span>' : '') + (videosOf(p).length ? ' <span class="vidb" title="Є відео"><svg class="ico" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m16 13 5.22 3.48a.5.5 0 0 0 .78-.42V7.87a.5.5 0 0 0-.75-.43L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg> Відео</span>' : '') + '</span>' +
        '<button class="card__name" type="button" data-open="' + p.id + '">' + esc(p.name) + '</button>' +
        '<div class="card__foot">' + pillHTML(p) + stockHTML(p) +
        (!hasPrice(p) && p.price_uah_original ? '<span class="uah">у пості: ' + esc(p.price_uah_original) + '</span>' : '') +
        '</div>' +
        (isGun(p) ? cmpBtnHTML(p, 'cmpt--card') : '') +
      '</div></div></li>';
  }
  var PAGE = 48, curList = [], shown = 0, io = null;

  /* ---------- картки: скелетон фото + плавна поява при прокрутці (03.10.2026) ----------
     Прогресивне покращення: картка ховається (.rv-wait) ЛИШЕ коли є IntersectionObserver і не ввімкнено
     prefers-reduced-motion; страховочний таймер показує все, що мало б бути видно. Фото: .card__img.is-ld = шимер,
     знімається на load/error (і одразу для фото з кешу). Без JS карток немає взагалі, тож прихованими вони не лишаться. */
  var RM = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var revealIO = null, revealQuiet = false, revealKey = null, revealQ = [], revealT = null;
  function revealOn() { return 'IntersectionObserver' in window && !RM.matches; }
  function cardShow(c, delay) {
    if (!c.classList.contains('rv-wait')) return;
    if (revealIO) revealIO.unobserve(c);
    c.classList.add('rv-anim');
    if (delay) c.style.transitionDelay = delay + 'ms';
    c.classList.remove('rv-wait');
    setTimeout(function () { c.classList.remove('rv-anim'); c.style.transitionDelay = ''; }, 650 + (delay || 0));
  }
  function revealFlush() {
    revealT = null;
    var q = revealQ.splice(0); q.sort(function (a, b) { var ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); return (ra.top - rb.top) || (ra.left - rb.left); });
    q.forEach(function (c, i) { cardShow(c, Math.min(i, 6) * 60); });
  }
  function revealObserve(cards) {
    if (!cards.length) return;
    if (revealQuiet || !revealOn()) return;
    if (!revealIO) {
      try {
        revealIO = new IntersectionObserver(function (en) {
          en.forEach(function (e) { if (e.isIntersecting) { revealIO.unobserve(e.target); revealQ.push(e.target); } });
          if (revealQ.length && !revealT) revealT = setTimeout(revealFlush, 16);
        }, { rootMargin: '0px 0px -6% 0px', threshold: 0.01 });
      } catch (e) { revealIO = null; return; }
    }
    cards.forEach(function (c) { c.classList.add('rv-wait'); revealIO.observe(c); });
    // страховка: якщо спостерігач «мовчить», картки у вікні все одно з'являються
    setTimeout(function () {
      var h = window.innerHeight || 800;
      cards.forEach(function (c) { if (c.classList.contains('rv-wait') && c.isConnected) { var r = c.getBoundingClientRect(); if (r.top < h && r.bottom > 0) cardShow(c, 0); } });
    }, 1800);
  }
  function imgDone(img, ok, instant) {
    var b = img.parentNode; if (!b || !b.classList || !b.classList.contains('is-ld')) return;
    if (!ok && !img.hasAttribute('data-fb') && img.getAttribute('src') !== PLACEHOLDER) { img.setAttribute('data-fb', '1'); img.src = PLACEHOLDER; return; } // зламане фото → логотип
    if (instant) b.classList.add('no-fade');
    b.classList.remove('is-ld');
    if (!ok) b.classList.add('is-err');
  }
  function imgWatch(scope) {
    $$('.card__img.is-ld img', scope).forEach(function (img) {
      if (img.complete && img.getAttribute('src')) imgDone(img, img.naturalWidth > 0, true); // з кешу або вже завантажене
    });
  }
  // load/error не спливають — ловимо на фазі захоплення для всіх карток (і для перших, і для догружених)
  document.addEventListener('load', function (e) { var t = e.target; if (t && t.tagName === 'IMG' && t.parentNode && t.parentNode.classList && t.parentNode.classList.contains('card__img')) imgDone(t, true); }, true);
  document.addEventListener('error', function (e) { var t = e.target; if (t && t.tagName === 'IMG' && t.parentNode && t.parentNode.classList && t.parentNode.classList.contains('card__img')) imgDone(t, false); }, true);

  function renderMore() {
    var next = curList.slice(shown, shown + PAGE), grid = $('#grid'), before = grid.children.length;
    grid.insertAdjacentHTML('beforeend', next.map(function (p, i) { return cardHTML(p, shown + i); }).join(''));
    var added = Array.prototype.slice.call(grid.children, before);
    imgWatch(grid);
    revealObserve(added);
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
    excl: 'Ексклюзивні та лімітовані версії з позначкою «Ексклюзив». Кількість обмежена — наявність підтверджуємо при замовленні.',
    guns: 'Фарбопульти Meiji і SATA — від найдорожчих до найдешевших. Тут також обдувні та антистатичний пістолети. Фарбопульти NTools, ITALCO, Auarita та інші китайського виробництва — у розділі «Товари з Китаю».',
    pdr: 'Інструмент для ПДР — ремонту вм’ятин без фарбування: набори для витягування на клей, зворотні молотки й грибки, гачки, пневмоподушки та набори для осадження (tap-down). Ціну уточнюйте.',
    cn: 'Товари китайського виробництва: фарбопульти NTools, ITALCO, Auarita, SUTU, LISSON та інші, пістолет для антигравію, набір для чистки фарбопульта, пневматична шліфмашинка й товщиномір покриттів — від найдорожчих до найдешевших.',
    equip: 'Манометри й регулятори Meiji та SATA, PPS-системи та бачки, аксесуари для фарбопульта, обладнання для майстерні (пінники, помпи, мийка, фільтр повітря), інструмент для маляра й ПДР та засоби захисту.',
    acc: 'Манометри Meiji (електронний і механічний), бачки, додаткові дюзи та перехідники PPS.',
    palinal: 'Лакофарбові матеріали PALINAL від офіційного представника в Україні: 2K автоемалі та базові фарби в готових кольорах, лаки, ґрунти, розчинники, антисилікони та добавки. Шпаклівки PALINAL — у розділі «Шпаклівки».',
    lak: 'Лаки Palinal серій 223 і 923: акрилові 2K, HS і UHS, матові — є комплекти 5 л + 2,5 л затверджувача.',
    emal2k: 'Palinal автоемаль 2K Multicryl 900 у готових кольорах RAL, VW, MERC, FORD та інших — глянцеве покриття без лаку.',
    baza: 'Базові фарби Palinal під лак у готових кольорах, банка 1 л — наносяться під 2K лак.',
    grunt: 'Ґрунти Palinal: акрилові наповнювачі 5:1, «мокрий по мокрому», епоксидний, по пластику та Wash Primer.',
    shpak: 'Усі шпаклівки в одному розділі: PALINAL (універсальна, полегшена, з алюмінієм, по пластику, розпилювальна), NOVOL Professional (зі скловолокном, універсальна, з алюмінієм, фінішна, з вуглеволокном) та Roberlo.',
    rozch: 'Розчинники Palinal Multicryl (швидкий, стандартний, повільний), антисилікони та добавки для переходів.',
    savex: 'Розчинники та знежирювачі Savex (виробництво Литва): акрилові, для металіків, 646, 647 і GUN CLEANER.',
    tools: 'Інструмент для маляра: антистатичний пістолет EASY PAINT, шліфування, рубанки й бруски, шпателі, пінники й помпи, змішувальні системи Palinal та інструмент для ПДР.',
    abraz: 'Абразиви 3M, sia, Smirdex, KOVAX і APP: диски, рулони, аркуші під воду, поролонові та фінішні диски Trizact, губки, скотч-брайт і засоби для підготовки поверхні.',
    polish: 'Полірувальні пасти 3M Perfect-It, Farécla і Cartec Refinish, полірувальні круги Cartec, засоби догляду за кузовом, мікрофібра NOWAX і серветки для майстерні.',
    mask: 'Маскувальний папір NCP 45 г/м² у різних розмірах, малярні стрічки APP, 3M, Helios, SOTRO та поролонова стрічка APP 3D Tape.',
    chem: 'Поліуретанові клеї-герметики TEROSON для вклеювання скла, антигравій APP і перетворювач іржі TEROSON VR 625, антисиліконова добавка APP та змивка старої фарби PiTon.',
    seal: 'Поліуретанові клеї-герметики TEROSON для вклеювання автомобільного скла.',
    cloth: 'Серветки з мікрофібри NOWAX, плюшева мікрофібра, паперові рушники та протирочні серветки для майстерні.',
    ppe: 'Засоби захисту для маляра: нітрилові рукавички MERCATOR GoGrip PRO та малярний комбінезон Mobihel.'
  };
  var BRAND_INTRO = {
    meiji: 'Японські фарбопульти Meiji від офіційного представника в Україні: FINER-CORE, FINER III, F410, міні-джет FINER SPOT. Дюзу і систему (HVLP / SP) підберемо в Telegram.',
    sata: 'Фарбопульти SATA з технологією RP: SATAjet X DIGITAL pro та SATAjet 100 B.'
  };
  function brandName(k) { for (var i = 0; i < GUN_BRANDS.length; i++) if (GUN_BRANDS[i].k === k) return GUN_BRANDS[i].t; return ''; }
  function listTitle() {
    if (state.cat === 'all') return CONFIG.homeTitle;
    if (state.cat === 'guns' && state.brand && state.brand !== 'other') return (state.sub ? subName('guns', state.sub) : 'Фарбопульти') + ' ' + brandName(state.brand) + ' — купити в Україні | ' + CONFIG.titleName;
    if (state.sub && subItem(state.cat, state.sub)) return (state.cat === 'palinal' ? 'PALINAL — ' + subName('palinal', state.sub).toLowerCase() : subName(state.cat, state.sub)) + ' — купити в Україні | ' + CONFIG.titleName;
    if (state.cat === 'sale') return 'Акції | ' + CONFIG.titleName;
    if (state.cat === 'new') return 'Новинки | ' + CONFIG.titleName;
    if (state.cat === 'excl') return 'Ексклюзив | ' + CONFIG.titleName;
    if (state.cat === 'fav') return 'Вибране | ' + CONFIG.titleName;
    return catById[state.cat].name + ' — купити в Україні | ' + CONFIG.titleName;
  }
  var EMPTY_TXT = '';
  function renderGrid() {
    var list = filtered();
    curList = list; shown = 0;
    // анімація появи — лише коли змінився розділ/сортування (не при наборі в пошуку, закритті модалки чи оновленні з Firebase)
    var rk = state.cat + '|' + state.sort; revealQuiet = revealKey !== null && rk === revealKey; revealKey = rk;
    if (revealIO) { revealIO.disconnect(); revealQ = []; }
    $('#grid').innerHTML = '';
    renderMore();
    revealQuiet = false;
    $('#empty').hidden = list.length > 0;
    if (!EMPTY_TXT) EMPTY_TXT = $('#empty').textContent;
    $('#empty').textContent = state.cat === 'fav' && !state.q ? 'У вибраному поки порожньо. Натисніть сердечко на картці товару, щоб зберегти його тут.' : EMPTY_TXT;
    var cn = catLabel(state.cat);
    if (state.sub && !state.q && subItem(state.cat, state.sub)) cn += ' · ' + subName(state.cat, state.sub);
    if (state.cat === 'guns' && state.brand && !state.q) cn += ' · ' + brandName(state.brand);
    var title = state.cat === 'all' ? 'Усі товари' : cn;
    if (state.q) title = 'Пошук: «' + state.q + '»' + (state.cat !== 'all' ? ' · ' + cn : '');
    $('#restitle').textContent = title + ' (' + list.length + ')';
    var csh = $('#catshare'); if (csh) csh.hidden = !!state.q || state.cat === 'all' || state.cat === 'fav';
    var pc = $('#pickcta'); if (pc) pc.hidden = !!state.q || state.cat !== 'guns';
    var cc = $('#codecta'); if (cc) cc.hidden = !!state.q || !(state.cat === 'palinal' && /^(emal2k|baza)$/.test(state.sub));
    var cq = $('#codeq'); if (cq) { var qq = state.q.trim(); cq.hidden = !(qq && !list.length && /^(RAL\s?\d{4}|[A-Za-zА-Яа-яІі0-9]{2,7}([\/-][A-Za-z0-9]{1,5})?)$/.test(qq)); if (!cq.hidden) { var cqb = cq.querySelector('[data-cq-code]'); if (cqb) cqb.textContent = qq; } }
    var ci = $('#catintro'); if (ci) { var it = !state.q && ((state.cat === 'guns' && BRAND_INTRO[state.brand]) || (state.cat === 'palinal' && CAT_INTRO[state.sub]) || CAT_INTRO[state.cat]); ci.textContent = it || ''; ci.hidden = !it; }
    renderBrandBar();
    var so = $('#sort option[value="def"]'); if (so) so.textContent = state.cat === 'all' ? 'За розділами' : 'Спочатку дорожчі';
    var ct = $('#cattiles'); if (ct) ct.hidden = state.cat !== 'all' || !!state.q;
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

  /* ---------- 08.10.2026: що додають у кошик — Firestore cart_events (пише js/fb.js; читає лише адмін) ----------
     Подія: товар (id, назва), варіант, кількість, ціна (і стара ціна, якщо знижка), розділ сайту, сторінка; js/fb.js додає
     користувача (uid + ім'я/email, якщо увійшов; інакше «Гість» + анонімний id пристрою) і серверний час.
     Захист від спаму: кліки по тому самому товару/варіанту протягом 2,5 с зливаються в одну подію (кількість сумується),
     не більше CE_MAX подій за вкладку на добу; боти/автотести й пристрій адміна («не рахувати мої відвідування») — не рахуються. */
  var cartEvWriter = null, cartEvQ = [], cartEvPend = {}, CE_MAX = 60, CE_WAIT = 2500;
  var CE_EMU = (function () { try { return /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && (/[?&]emu=1\b/.test(location.search) || sessionStorage.getItem('alexbes_emu') === '1'); } catch (e) { return false; } })();
  function cartSecName() {
    if (state.q) return 'Пошук';
    var c = state.cat;
    if (c === 'all') return 'Каталог (усі товари)';
    if (c === 'sale') return 'Акції';
    if (c === 'new') return 'Новинки';
    if (c === 'fav') return 'Вибране';
    return catById[c] ? catById[c].name : String(c || 'Каталог');
  }
  function cartSrc(t) {
    if (!t || !t.closest) return 'Інше';
    if (t.closest('#cmpmodal')) return 'Порівняння';
    if (t.closest('#pickmodal')) return 'Підбір фарбопульта';
    if (t.closest('.cs__card')) return 'Пошук фарби за кодом';
    if (t.closest('.rel')) return 'Ще купують разом';
    if (t.closest('#pmbar')) return 'Картка товару (нижня панель)';
    if (t.closest('#pmodal')) return 'Картка товару · ' + cartSecName();
    if (t.closest('.card')) return cartSecName();
    return 'Інше';
  }
  function cartEvSend(ev) { try { var r = cartEvWriter(ev); if (r && r.catch) r.catch(function () {}); } catch (e) {} }
  function cartEvFlush(k) {
    var e = cartEvPend[k]; if (!e) return;
    clearTimeout(e.t); delete cartEvPend[k];
    try {
      var day = statDay(), s = null;
      try { s = JSON.parse(sessionStorage.getItem('alexbes_ce') || 'null'); } catch (x) {}
      if (!s || s.d !== day) s = { d: day, n: 0 };
      if (s.n >= CE_MAX) return;
      s.n++; try { sessionStorage.setItem('alexbes_ce', JSON.stringify(s)); } catch (x) {}
    } catch (x) {}
    var p = e.p, v = variantOf(p, e.vi), up = unitPrice(p, e.vi), uo = up != null ? unitOld(p, e.vi) : null;
    var ev = { pid: String(p.id).slice(0, 80), name: String(p.name || p.id).slice(0, 200), vi: Math.max(0, Math.min(199, e.vi | 0)),
      variant: v ? String(uahText(v.label) || '').replace(/\u00a0/g, ' ').slice(0, 100) : '', qty: Math.max(1, Math.min(999, e.qty | 0)),
      price: up != null ? toUah(up) : null, old: uo != null ? toUah(uo) : null,
      sec: String(e.src || 'Інше').slice(0, 80), page: String(e.page || '#/').slice(0, 120) };
    if (cartEvWriter) cartEvSend(ev); else if (cartEvQ.length < 20) cartEvQ.push(ev);
  }
  function cartEvent(p, vi, qty, src) {
    try {
      if (!p || (statSkip && !CE_EMU) || localStorage.getItem('alexbes_nostats') === '1') return;
      var k = p.id + ':' + (vi | 0), e = cartEvPend[k];
      if (e) { e.qty += qty; clearTimeout(e.t); } else e = cartEvPend[k] = { p: p, vi: vi | 0, qty: qty, src: src, page: location.hash || '#/' };
      e.t = setTimeout(function () { cartEvFlush(k); }, CE_WAIT);
    } catch (x) {}
  }
  // вкладку закривають / ховають — відправляємо те, що чекає
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') Object.keys(cartEvPend).forEach(cartEvFlush); });

  /* ---------- product modal ---------- */
  var pmState = { id: null, vi: 0, qty: 1 };
  var trackedOpen = null; // product id already counted for the current modal open
  function openProduct(id) {
    var p = byId[id]; if (!p) return;
    if (trackedOpen !== id || !openModalEl || openModalEl !== $('#pmodal')) { trackedOpen = id; track('товар/' + p.id, p.name); stat('p_' + p.id); }
    var swap = openModalEl && openModalEl === $('#pmodal') && pmState.id !== id; // перехід з «Ще купують разом»
    lbHide();
    pmState = { id: id, vi: 0, qty: 1, gi: 0 };
    renderProduct();
    pushRecent(id);
    showModal('#pmodal');
    if (swap) { var bx = $('#pmodal .modal__box'); if (bx) bx.scrollTop = 0; }
    document.title = productTitle(p.name);
  }
  function productTitle(name) { // 09.10: як <title> статичних сторінок p/ — без ціни, до 65 символів
    var n = String(name || '').trim().replace(/([^.])\.$/, '$1').trim();
    var t = n + (n.indexOf('\u2014') >= 0 ? ', ' : ' \u2014 ') + 'купити в Чернівцях | ' + CONFIG.titleName;
    return t.length > 65 ? n + ' | ' + CONFIG.titleName : t;
  }
  function tdsHTML(p) {
    var t = p.tds; if (!t || !t.rows) return '';
    return '<details class="tds" open><summary><svg class="ico" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg> Технічні дані (ТДС)</summary>' +
      '<dl class="tds__dl">' + t.rows.map(function (r) { return '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>'; }).join('') + '</dl>' +
      '<p class="tds__src">' + (t.url ? '<a href="' + esc(t.url) + '" target="_blank" rel="noopener" data-tds-link>' + esc(t.label) + ' ↗</a>' +
      (t.edition ? ' <span>· ' + esc(t.edition) + '</span>' : '') + '<br>' : '') + '<span>Коротко нашими словами за даними технічного паспорта виробника' + (t.url ? '; у разі розбіжностей діє оригінал.' : '.') + '</span></p></details>';
  }
  function specsHTML(p) {
    var s = p.specs; if (!s || !s.rows) return '';
    return '<details class="tds specs" open><summary><svg class="ico" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg> Технічні характеристики</summary>' +
      '<dl class="tds__dl specs__dl">' + s.rows.map(function (r) { return '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>'; }).join('') + '</dl>' +
      (s.src ? '<p class="tds__src specs__src"><span>' + esc(s.src) + '</span></p>' : '') + '</details>';
  }
  function galleryHTML(p) {
    var g = galleryOf(p), n = g.length;
    var zoom = g.length && !(n === 1 && g[0].src && p.photo_is_placeholder) ? '<button class="pm__zoom" type="button" data-lb-open aria-label="Відкрити фото на весь екран"><span aria-hidden="true">⤢</span></button>' : '';
    if (spinOf(p)) zoom += '<button class="pm__360" type="button" data-spin-open aria-label="Обертання 360°: подивитися фарбопульт з усіх боків">' + SPIN_IC + '<span>360°</span></button>';
    if (n <= 1) return '<div class="pm__img' + (zoom ? ' is-zoomable' : '') + '"><img ' + imgAttrs(p, g[0]) + ' alt="' + esc(p.name) + '">' + promoHTML(p) + zoom + '</div>';
    return '<div class="pm__img gal is-zoomable" data-gal>' + zoom +
      '<div class="gal__track" tabindex="0" aria-label="Фото товару, гортайте">' + g.map(function (x, i) {
        return '<div class="gal__it"><img ' + imgAttrs(p, x) + ' alt="' + esc(p.name) + ' — фото ' + (i + 1) + '"' + (i ? ' loading="lazy"' : '') + '></div>';
      }).join('') + '</div>' + promoHTML(p) +
      '<button class="gal__nav gal__nav--p" type="button" data-gal-step="-1" aria-label="Попереднє фото">‹</button>' +
      '<button class="gal__nav gal__nav--n" type="button" data-gal-step="1" aria-label="Наступне фото">›</button>' +
      '<div class="gal__dots">' + g.map(function (x, i) { return '<button type="button" data-gal-to="' + i + '" aria-label="Фото ' + (i + 1) + '"' + (i === 0 ? ' class="on"' : '') + '></button>'; }).join('') + '</div>' +
      '<span class="gal__cnt" data-gal-cnt>1 / ' + n + '</span></div>';
  }
  var PLAY_SVG = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="currentColor" d="M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5Z"/></svg>';
  // p.videos: static mapping from data/products.js (TikTok @alex_bespik) or the admin override from Firestore (same field)
  var TT_META = (DATA.tiktok && DATA.tiktok.videos) || {};
  function videosOf(p) {
    var M = window.AlexBesMedia; if (!M || !p || !Array.isArray(p.videos)) return [];
    return p.videos.slice(0, 5).map(function (u) {
      var v = M.parseVideo(u); if (!v) return null;
      var mt = v.type === 'tiktok' && v.id && TT_META[v.id];
      if (mt && mt.thumb && !v.thumb) v.thumb = mt.thumb;
      if (mt && mt.caption) v.caption = mt.caption;
      return v;
    }).filter(Boolean);
  }
  function videosHTML(p) {
    var vs = videosOf(p); if (!vs.length) return '';
    var allV = vs.every(function (v) { return v.vertical && v.embed; });
    return '<div class="vids"><p class="vids__ttl"><svg class="ico" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m16 13 5.22 3.48a.5.5 0 0 0 .78-.42V7.87a.5.5 0 0 0-.75-.43L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg> Відео</p><div class="vids__list' + (allV && vs.length > 1 ? ' vids__list--v' : '') + '">' + vs.map(function (v, i) {
      if (!v.embed) return '<div class="vitem vitem--link"><a class="btn btn--o btn--full vid__link" href="' + esc(v.url) + '" target="_blank" rel="noopener" data-vid-link="' + i + '">' + PLAY_SVG + ' Дивитись відео · ' + esc(v.label) + ' ↗</a></div>';
      return '<div class="vitem"><div class="vid' + (v.vertical ? ' vid--v' : '') + '" data-vid-box="' + i + '"><button class="vid__ph vid__ph--' + v.type + '" type="button" data-vid="' + i + '" aria-label="Відтворити відео ' + esc(v.label) + '">' +
        (v.thumb ? '<img src="' + esc(v.thumb) + '" alt="' + esc(v.caption ? 'Обкладинка відео: ' + v.caption : '') + '" loading="lazy" decoding="async">' : '') +
        '<span class="vid__play" aria-hidden="true">' + PLAY_SVG + '</span><span class="vid__lbl">' + esc(v.label) + '</span></button></div>' +
        '<a class="vid__ext" href="' + esc(v.url) + '" target="_blank" rel="noopener" data-vid-link="' + i + '">' + (v.type === 'tiktok' ? 'Дивитись у TikTok' : 'Відкрити в ' + esc(v.type === 'youtube' ? 'YouTube' : v.label)) + ' ↗</a></div>';
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
  /* ---------- обертання 360° (03.10.2026) ----------
     p.spin = { dir: 'img/360/<id>/', frames: N, ext: 'webp' } — справжня серія кадрів (джерело — _work/spin_sources.json), кадри 01…NN.
     Кадри вантажаться лише після натискання «360°»: спершу кожен 4-й (можна крутити одразу), потім решта; показуємо найближчий готовий.
     Тягніть по горизонталі (миша / палець; вертикальний свайп лишається прокруткою), стрілки ←/→. Один м'який оберт-підказка
     після завантаження (без prefers-reduced-motion), зупиняється від першого дотику. */
  var SPIN_IC = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><ellipse cx="12" cy="12" rx="9.5" ry="3.6"/><path d="M12 3.2v1.6M12 19.2v1.6" opacity=".55"/><path d="M17.6 6.4l2.3.4-.6 2.2"/><path d="M19.9 6.8C18.2 5.1 15.3 4 12 4"/></svg>';
  function spinOf(p) {
    var b = p && (BASE[p.id] || p), s = b && b.spin;
    return s && typeof s.dir === 'string' && /^img\/360\/[\w-]+\/$/.test(s.dir) && s.frames > 7 && s.frames <= 120 ? s : null;
  }
  function spinSrc(s, i) { var n = String(i + 1); while (n.length < 2) n = '0' + n; return s.dir + n + '.' + (s.ext || 'webp') + (s.v ? '?v=' + s.v : ''); }
  var spin = null; // { el, img, s, n, cur, ok[], imgs[], left, drag, hint }
  function spinStop() {
    if (!spin) return;
    if (spin.hint) cancelAnimationFrame(spin.hint);
    spin.imgs.forEach(function (im) { im.onload = im.onerror = null; });
    if (spin.el && spin.el.parentNode) spin.el.parentNode.removeChild(spin.el);
    var box = $('#pm .pm__img'); if (box) box.classList.remove('is-spin');
    spin = null;
  }
  function spinShow(i) {
    if (!spin) return;
    var n = spin.n; i = ((Math.round(i) % n) + n) % n; spin.cur = i;
    var k = i; if (!spin.ok[k]) { for (var d = 1; d < n; d++) { if (spin.ok[(i + d) % n]) { k = (i + d) % n; break; } if (spin.ok[(i - d + n) % n]) { k = (i - d + n) % n; break; } } }
    if (spin.ok[k] && spin.shown !== k) { spin.img.src = spin.imgs[k].src; spin.shown = k; }
  }
  function spinOpen() {
    var p = byId[pmState.id], s = spinOf(p), box = $('#pm .pm__img'); if (!s || !box) return;
    spinStop();
    var el = document.createElement('div');
    el.className = 'spin'; el.tabIndex = 0;
    el.setAttribute('role', 'slider'); el.setAttribute('aria-label', 'Обертання 360°: ' + p.name + '. Тягніть ліворуч або праворуч чи використовуйте стрілки');
    el.setAttribute('aria-valuemin', '0'); el.setAttribute('aria-valuemax', '359');
    el.innerHTML = '<img class="spin__f" alt="' + esc(p.name) + ' — обертання 360°" draggable="false" decoding="async">' +
      '<span class="spin__bar" aria-hidden="true"><i></i></span>' +
      '<span class="spin__hint" aria-hidden="true">' + SPIN_IC + 'Потягніть, щоб обернути</span>' +
      '<button class="spin__x" type="button" data-spin-close aria-label="Закрити обертання 360°, повернутися до фото"><span aria-hidden="true">✕</span> 360°</button>';
    box.appendChild(el); box.classList.add('is-spin');
    spin = { el: el, img: $('.spin__f', el), s: s, n: s.frames, cur: 0, shown: -1, ok: [], imgs: [], loaded: 0, drag: null, hint: 0, touched: false };
    var order = [], seen = {}, step;
    [8, 4, 2, 1].forEach(function (st) { for (var i = 0; i < s.frames; i += st) if (!seen[i]) { seen[i] = 1; order.push(i); } });
    var me = spin, bar = $('.spin__bar i', el), q = 0, active = 0, MAXC = 6;
    function next() {
      while (me === spin && active < MAXC && q < order.length) {
        (function (i) {
          var im = new Image(); active++;
          im.decoding = 'async';
          im.onload = im.onerror = function (ev) {
            active--; if (me !== spin) return;
            if (ev.type === 'load') me.ok[i] = true;
            me.loaded++; bar.style.transform = 'scaleX(' + (me.loaded / me.n) + ')';
            if (i === 0 || (me.shown < 0 && me.ok[i])) spinShow(me.cur);
            else if (me.shown !== me.cur && me.ok[i]) spinShow(me.cur);
            if (me.loaded >= me.n) { el.classList.add('is-ready'); spinHint(); }
            next();
          };
          me.imgs[i] = im; im.src = spinSrc(s, i);
        })(order[q++]);
      }
    }
    next();
    el.addEventListener('pointerdown', spinDown);
    el.addEventListener('pointermove', spinMove);
    el.addEventListener('pointerup', spinUp);
    el.addEventListener('pointercancel', spinUp);
    el.addEventListener('dragstart', function (e) { e.preventDefault(); });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); spinTouch(); spinShow(spin.cur + (e.key === 'ArrowLeft' ? -1 : 1)); spinAria(); }
    });
    try { el.focus({ preventScroll: true }); } catch (x) {}
    track('360/' + p.id, '360°: ' + p.name);
  }
  function spinAria() { if (spin) spin.el.setAttribute('aria-valuenow', String(Math.round(spin.cur * 360 / spin.n))); }
  function spinTouch() { if (!spin) return; spin.touched = true; if (spin.hint) { cancelAnimationFrame(spin.hint); spin.hint = 0; } spin.el.classList.add('is-used'); }
  function spinHint() { // один повільний оберт-підказка
    if (!spin || spin.touched || RM.matches) return;
    var me = spin, t0 = null, from = me.cur, dur = 2600;
    function f(t) {
      if (me !== spin || me.touched) return;
      if (t0 == null) t0 = t;
      var k = Math.min(1, (t - t0) / dur), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      spinShow(from + e * me.n);
      if (k < 1) me.hint = requestAnimationFrame(f); else { me.hint = 0; spinAria(); }
    }
    me.hint = requestAnimationFrame(f);
  }
  function spinDown(e) {
    if (!spin || e.target.closest('button')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    spinTouch();
    spin.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, f: spin.cur, on: e.pointerType === 'mouse' };
    if (e.pointerType === 'mouse') { try { spin.el.setPointerCapture(e.pointerId); } catch (x) {} spin.el.classList.add('is-drag'); }
  }
  function spinMove(e) {
    var d = spin && spin.drag; if (!d || d.id !== e.pointerId) return;
    var dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.on) { // палець: обертаємо лише після явно горизонтального руху, інакше — прокрутка сторінки
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      if (Math.abs(dy) > Math.abs(dx)) { spin.drag = null; return; }
      d.on = true; try { spin.el.setPointerCapture(e.pointerId); } catch (x) {} spin.el.classList.add('is-drag');
    }
    var w = spin.el.clientWidth || 300;
    spinShow(d.f - dx / (w * 0.9) * spin.n); // ~ ширина кадру = один оберт; праворуч — проти годинникової
  }
  function spinUp(e) {
    var d = spin && spin.drag; if (!d || d.id !== e.pointerId) return;
    spin.drag = null; spin.el.classList.remove('is-drag'); spinAria();
  }
  /* ---------- повноекранний перегляд фото з зумом (03.10.2026) ----------
     Тап по головному фото в картці товару → темний лайтбокс: свайп між фото галереї, лічильник «1 / 3»,
     pinch-zoom і подвійний тап (мобільний), колесо / клік (ПК), перетягування при зумі, ✕ / Esc / «Назад».
     «Назад» на Android закриває перегляд, а не сайт: при відкритті — history.pushState({alexbesLb}), закриття — history.back().
     Фото — найкраща доступна якість: p.photo_full (якщо колись з'явиться) або те саме фото / фото з Firestore. */
  var LB_MAX = 5, LB_DBL = 2.5;
  var lb = { el: null, open: false, pushed: false, p: null, n: 0, i: 0, s: 1, tx: 0, ty: 0, ptr: {}, g: null, lastTap: null, wheelT: 0, back: null };
  function lbIsOpen() { return lb.open; }
  function lbSrcAttrs(p, g) {
    if (g && g.src && p.photo_full && (g.src === p.photo || (BASE[p.id] && g.src === BASE[p.id].photo))) return 'src="' + esc(p.photo_full) + '"';
    return imgAttrs(p, g);
  }
  function lbBuild() {
    if (lb.el) return lb.el;
    var el = document.createElement('div');
    el.className = 'lb'; el.id = 'lb'; el.hidden = true;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Перегляд фото');
    document.body.appendChild(el);
    el.addEventListener('pointerdown', lbDown);
    el.addEventListener('pointermove', lbMove);
    el.addEventListener('pointerup', lbUp);
    el.addEventListener('pointercancel', lbUp);
    el.addEventListener('lostpointercapture', lbUp);
    el.addEventListener('wheel', lbWheel, { passive: false });
    el.addEventListener('dragstart', function (e) { e.preventDefault(); });
    el.addEventListener('keydown', function (e) { // фокус не виходить з перегляду
      if (e.key !== 'Tab') return;
      var f = $$('button:not([hidden])', el); if (!f.length) return;
      var k = f.indexOf(document.activeElement);
      e.preventDefault(); f[(k + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus();
    });
    lb.el = el;
    return el;
  }
  function lbOpen(i) {
    var p = byId[pmState.id]; if (!p) return;
    var g = galleryOf(p);
    if (!g.length || (g.length === 1 && g[0].src && p.photo_is_placeholder)) return;
    var el = lbBuild(), n = g.length;
    lb.p = p; lb.n = n; lb.i = Math.max(0, Math.min(n - 1, i || 0)); lb.s = 1; lb.tx = lb.ty = 0; lb.ptr = {}; lb.g = null; lb.lastTap = null;
    lb.back = document.activeElement;
    el.innerHTML = '<div class="lb__track">' + g.map(function (x, k) {
        return '<div class="lb__sl"><img class="lb__img" ' + lbSrcAttrs(p, x) + ' alt="' + esc(p.name) + (n > 1 ? ' — фото ' + (k + 1) : '') + '" draggable="false" decoding="async"></div>';
      }).join('') + '</div>' +
      '<div class="lb__top"><span class="lb__cnt" aria-live="polite"' + (n > 1 ? '' : ' hidden') + '></span>' +
      '<button class="lb__x" type="button" data-lb-close aria-label="Закрити перегляд">✕</button></div>' +
      (n > 1 ? '<button class="lb__nav lb__nav--p" type="button" data-lb-step="-1" aria-label="Попереднє фото">‹</button>' +
               '<button class="lb__nav lb__nav--n" type="button" data-lb-step="1" aria-label="Наступне фото">›</button>' : '') +
      '<p class="lb__hint">' + (matchMedia('(hover:hover) and (pointer:fine)').matches ? 'Колесо або клік — зум · перетягуйте для огляду' : 'Два пальці або подвійний тап — зум') + '</p>';
    el.hidden = false; lb.open = true;
    document.documentElement.classList.add('lb-on');
    lbPos(true); lbApply(true);
    fillPhotos();
    try { history.pushState({ alexbesLb: 1 }, '', location.href); lb.pushed = true; } catch (e) { lb.pushed = false; }
    var x = $('.lb__x', el); if (x) x.focus({ preventScroll: true });
    track('фото/' + p.id, 'Фото на весь екран: ' + p.name);
  }
  function lbHide() {
    if (!lb.open) return;
    lb.open = false; lb.pushed = false; lb.ptr = {}; lb.g = null;
    lb.el.hidden = true; lb.el.innerHTML = '';
    document.documentElement.classList.remove('lb-on');
    var tr = $('#pm [data-gal] .gal__track'); // модальна галерея — на тому ж фото, що й у перегляді
    if (tr && lb.p && lb.p.id === pmState.id) { pmState.gi = lb.i; tr.scrollLeft = lb.i * tr.clientWidth; }
    if (lb.back && lb.back.focus && lb.back.isConnected) lb.back.focus({ preventScroll: true });
  }
  function lbClose() {
    if (!lb.open) return;
    if (lb.pushed && history.state && history.state.alexbesLb) { history.back(); return; } // popstate → lbHide()
    lbHide();
  }
  window.addEventListener('popstate', function () { if (lb.open && !(history.state && history.state.alexbesLb)) lbHide(); });
  function lbSlide() { return lb.el ? $$('.lb__sl', lb.el)[lb.i] : null; }
  function lbImg() { var s = lbSlide(); return s ? $('.lb__img', s) : null; }
  function lbPos(instant, dx) { // стрічка фото: зсув на поточне фото (+ dx під пальцем)
    var tr = $('.lb__track', lb.el); if (!tr) return;
    tr.classList.toggle('is-drag', !!instant);
    tr.style.transform = 'translate3d(calc(' + (-lb.i * 100) + '% + ' + (dx || 0) + 'px),0,0)';
    var c = $('.lb__cnt', lb.el); if (c) c.textContent = (lb.i + 1) + ' / ' + lb.n;
    lb.el.classList.toggle('is-zoom', lb.s > 1.01);
  }
  function lbClamp() {
    var im = lbImg(), sl = lbSlide(); if (!im || !sl) return;
    var mx = Math.max(0, (im.offsetWidth * lb.s - sl.clientWidth) / 2), my = Math.max(0, (im.offsetHeight * lb.s - sl.clientHeight) / 2);
    lb.tx = Math.max(-mx, Math.min(mx, lb.tx)); lb.ty = Math.max(-my, Math.min(my, lb.ty));
  }
  function lbApply(instant) {
    var im = lbImg(); if (!im) return;
    im.classList.toggle('is-anim', !instant);
    im.style.transform = 'translate3d(' + lb.tx + 'px,' + lb.ty + 'px,0) scale(' + lb.s + ')';
    lb.el.classList.toggle('is-zoom', lb.s > 1.01);
  }
  function lbPoint(cx, cy) { var r = lbSlide().getBoundingClientRect(); return { x: cx - r.left - r.width / 2, y: cy - r.top - r.height / 2 }; } // від центру слайда
  function lbZoomTo(s, cx, cy, instant) { // зум навколо точки екрана (cx, cy)
    s = Math.max(1, Math.min(LB_MAX, s));
    var pt = lbPoint(cx, cy), k = s / lb.s;
    lb.tx = pt.x - (pt.x - lb.tx) * k; lb.ty = pt.y - (pt.y - lb.ty) * k; lb.s = s;
    if (s <= 1.01) { lb.s = 1; lb.tx = lb.ty = 0; }
    lbClamp(); lbApply(instant);
  }
  function lbReset(instant) { lb.s = 1; lb.tx = lb.ty = 0; lbApply(instant); }
  function lbGo(to, rel) {
    if (!lb.open || lb.n < 2) return;
    var j = rel ? lb.i + to : to; if (j < 0) j = lb.n - 1; if (j >= lb.n) j = 0;
    if (j === lb.i) return;
    lbReset(true); lb.i = j; lbReset(true); lbPos(false);
  }
  function lbToggleZoom(cx, cy) { if (lb.s > 1.01) lbReset(false); else lbZoomTo(LB_DBL, cx, cy, false); }
  function lbPts() { return Object.keys(lb.ptr).map(function (k) { return lb.ptr[k]; }); }
  function lbDown(e) {
    if (e.target.closest('button')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    lb.ptr[e.pointerId] = { x: e.clientX, y: e.clientY };
    try { lb.el.setPointerCapture(e.pointerId); } catch (x) {}
    var pts = lbPts();
    if (pts.length === 1) lb.g = { mode: 'one', x0: e.clientX, y0: e.clientY, tx0: lb.tx, ty0: lb.ty, t0: Date.now(), moved: false, type: e.pointerType, dir: null };
    else if (pts.length === 2) {
      var a = pts[0], b = pts[1];
      lb.g = { mode: 'pinch', d0: Math.hypot(b.x - a.x, b.y - a.y) || 1, s0: lb.s, m0: lbPoint((a.x + b.x) / 2, (a.y + b.y) / 2), tx0: lb.tx, ty0: lb.ty, moved: true };
      lbPos(true, 0);
    }
  }
  function lbMove(e) {
    var pt = lb.ptr[e.pointerId], g = lb.g; if (!pt || !g) return;
    pt.x = e.clientX; pt.y = e.clientY;
    if (g.mode === 'pinch') {
      var pts = lbPts(); if (pts.length < 2) return;
      var a = pts[0], b = pts[1], s = Math.max(1, Math.min(LB_MAX, g.s0 * Math.hypot(b.x - a.x, b.y - a.y) / g.d0));
      var m = lbPoint((a.x + b.x) / 2, (a.y + b.y) / 2);
      lb.s = s; lb.tx = m.x - (g.m0.x - g.tx0) * s / g.s0; lb.ty = m.y - (g.m0.y - g.ty0) * s / g.s0;
      lbClamp(); lbApply(true);
      return;
    }
    var dx = e.clientX - g.x0, dy = e.clientY - g.y0;
    if (!g.moved && Math.abs(dx) + Math.abs(dy) > 8) g.moved = true;
    if (!g.moved) return;
    if (lb.s > 1.01) { lb.tx = g.tx0 + dx; lb.ty = g.ty0 + dy; lbClamp(); lbApply(true); return; } // перетягування зумованого фото
    if (!g.dir) g.dir = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
    if (g.dir === 'x' && lb.n > 1) {
      var edge = (lb.i === 0 && dx > 0) || (lb.i === lb.n - 1 && dx < 0);
      lbPos(true, edge ? dx * 0.35 : dx);
    }
  }
  function lbUp(e) {
    var g = lb.g; if (!lb.ptr[e.pointerId]) return;
    delete lb.ptr[e.pointerId];
    var left = lbPts();
    if (!g) return;
    if (g.mode === 'pinch') {
      if (left.length === 1) { var r = left[0]; lb.g = { mode: 'one', x0: r.x, y0: r.y, tx0: lb.tx, ty0: lb.ty, t0: Date.now(), moved: true, type: e.pointerType, dir: null }; }
      else lb.g = null;
      if (lb.s <= 1.02) lbReset(false);
      return;
    }
    lb.g = null;
    if (e.type !== 'pointerup') { lbPos(false); return; }
    var dx = e.clientX - g.x0, dt = Date.now() - g.t0;
    if (!g.moved) { // тап / клік
      if (g.type === 'mouse') { lbToggleZoom(e.clientX, e.clientY); return; }
      var lt = lb.lastTap, now = Date.now();
      if (lt && now - lt.t < 320 && Math.hypot(e.clientX - lt.x, e.clientY - lt.y) < 30) { lb.lastTap = null; lbToggleZoom(e.clientX, e.clientY); }
      else lb.lastTap = { t: now, x: e.clientX, y: e.clientY };
      return;
    }
    if (lb.s > 1.01 || g.dir !== 'x' || lb.n < 2) { lbPos(false); return; }
    var w = lb.el.clientWidth || 1;
    if (dx < -w * 0.18 || (dx < -40 && dt < 300)) { if (lb.i < lb.n - 1) { lb.i++; lbReset(true); } }
    else if (dx > w * 0.18 || (dx > 40 && dt < 300)) { if (lb.i > 0) { lb.i--; lbReset(true); } }
    lbPos(false);
  }
  function lbWheel(e) {
    if (!lb.open || e.target.closest('button')) return;
    e.preventDefault();
    var dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    lbZoomTo(lb.s * Math.exp(-dy * 0.0025), e.clientX, e.clientY, true);
  }
  window.addEventListener('resize', function () { if (lb.open) { lbReset(true); lbPos(true); } });
  function pmGalIndex() {
    var tr = $('#pm [data-gal] .gal__track'); if (!tr) return 0;
    return Math.max(0, Math.round(tr.scrollLeft / Math.max(1, tr.clientWidth)));
  }
  /* ---------- «🧰 Ще купують разом» у картці товару (03.10.2026) ----------
     УСІ ПРАВИЛА — тут, у RELATED_RULES. Спрацьовує ПЕРШЕ правило (за порядком ключів), чий `when` підходить до товару.
       when:  { cats: [категорії], re: RegExp по «назва + код + опис» }            — обидві умови необов'язкові
       picks: [група, …] — група кандидатів:
         cats      — у яких категоріях шукати (без cats — у всіх)
         re / not  — RegExp, що МАЄ / НЕ МАЄ збігатися з «назва + код» кандидата
         max       — скільки взяти з групи (за замовчуванням 2)
         brandLock — кандидат з брендом у назві (Meiji, SATA, NTools…) лише до товару того ж бренду (бачки, дюзи)
         sameSeries— лише та сама серія Palinal (223 / 923 / 873…) або код кандидата згаданий в описі товару
         srcRe / srcNot — група застосовується, лише якщо товар-джерело (назва + опис) збігається / не збігається
         ifEmpty   — назва іншої групи (label): ця група лише тоді, коли та нічого не дала
     Нічого не вигадуємо: лише реальні товари каталогу (PRODUCTS після applyRemote — приховані вже прибрані),
     без «Немає в наявності» і без самого товару. Позначки ХІТ / Акція / Новинка — першими; далі «В наявності», далі решта.
     Набралось менше REL_MIN — добираємо товари в наявності з тієї ж категорії. */
  var REL_MIN = 4, REL_MAX = 8;
  var GUN_ANY = { cats: ['meiji', 'sata', 'china'], not: /ґрунтовоч|міні|spot|0\.8/i, max: 1 };
  var HARDENER_NOT = /primer|ґрунт|шпакл|емаль|фарба|лак\b/i; // «Wash Primer … + затверджувач 009» — це ґрунт, а не затверджувач
  var RELATED_RULES = {
    gun: { when: { cats: ['meiji', 'sata', 'china'] }, picks: [
      { label: 'дюзи', cats: ['acc'], re: /дюз|nozzle/i, brandLock: true, max: 1 },
      { label: 'фільтри / сита', re: /фільтр|ситечк|\bсито\b|strainer/i, max: 1 },
      { label: 'бачки / PPS', cats: ['acc'], re: /бач|pps/i, brandLock: true, max: 2 },
      { label: 'регулятори / манометри', cats: ['acc'], re: /манометр|регулятор/i, max: 2 },
      { label: 'миття пістолета', cats: ['savex', 'rozch', 'tools'], re: /gun\s*cleaner|миття\s+обладнання/i, max: 1 },
      { label: 'розчинник Palinal', cats: ['rozch'], re: /стандартний розчинник/i, not: /5\s*л/i, max: 1 },
      { label: 'розчинник Savex', cats: ['savex'], re: /розчинник/i, not: /металік|economy/i, max: 1 }
    ] },
    lak: { when: { cats: ['lak'] }, picks: [
      { label: 'затверджувач серії', re: /затверджувач|hardener/i, not: HARDENER_NOT, sameSeries: true, max: 2 },
      { label: 'затверджувач Palinal', re: /затверджувач|hardener/i, not: HARDENER_NOT, ifEmpty: 'затверджувач серії', max: 1 },
      { label: 'розчинник серії', cats: ['rozch'], re: /розчинник|thinner/i, sameSeries: true, max: 2, srcNot: /без (?:додавання )?розчинник/i },
      { label: 'розчинник Palinal', cats: ['rozch'], re: /^Palinal 075\.00\d0\b/i, not: /5\s*л/i, ifEmpty: 'розчинник серії', max: 2, srcNot: /без (?:додавання )?розчинник/i },
      { label: 'добавки для лаку', cats: ['rozch'], re: /955 BLEND|958\.1000M/i, max: 2 },
      Object.assign({ label: 'фарбопульт' }, GUN_ANY)
    ] },
    'grunt-epoxy': { when: { cats: ['grunt'], re: /епокс|epoxy|881\./i }, picks: [
      { label: 'розчинник для епоксиду', cats: ['rozch'], re: /^Palinal 077\b/i, max: 2 },
      { label: 'абразиви', cats: ['tools'], re: /шліф|абразив|наждач/i, max: 2 },
      { label: 'знежирювач', cats: ['rozch', 'savex'], re: /знежирювач|антисилікон/i, not: /добавк|additive|hydropal/i, max: 1 },
      { label: 'ґрунтовий фарбопульт', cats: ['china', 'meiji', 'sata'], re: /ґрунтовоч/i, max: 1 }
    ] },
    'grunt-hydro': { when: { cats: ['grunt'], re: /hydropal/i }, picks: [
      { label: 'водний знежирювач Hydropal', cats: ['rozch'], re: /hydropal/i, max: 1 },
      { label: 'абразиви', cats: ['tools'], re: /шліф|абразив|наждач/i, max: 2 },
      { label: 'ґрунтовий фарбопульт', cats: ['china', 'meiji', 'sata'], re: /ґрунтовоч/i, max: 1 }
    ] },
    'grunt-plastic': { when: { cats: ['grunt'], re: /пластик/i }, picks: [
      { label: 'антистатик', cats: ['tools'], re: /антистатич/i, max: 1 },
      { label: 'знежирювач', cats: ['rozch', 'savex'], re: /знежирювач|антисилікон/i, not: /добавк|additive|hydropal/i, max: 2 },
      { label: 'абразиви', cats: ['tools'], re: /шліф|абразив|наждач/i, max: 2 }
    ] },
    grunt: { when: { cats: ['grunt'] }, picks: [
      { label: 'затверджувач серії', re: /затверджувач|hardener/i, not: HARDENER_NOT, sameSeries: true, max: 1 },
      { label: 'розчинник Palinal', cats: ['rozch'], re: /^Palinal 075\.00\d0\b/i, not: /5\s*л/i, max: 2, srcNot: /wash primer|868\./i },
      { label: 'абразиви', cats: ['tools'], re: /шліф|абразив|наждач/i, max: 2 },
      { label: 'знежирювач', cats: ['rozch', 'savex'], re: /знежирювач|антисилікон/i, not: /добавк|additive|hydropal/i, max: 1 },
      { label: 'ґрунтовий фарбопульт', cats: ['china', 'meiji', 'sata'], re: /ґрунтовоч/i, max: 1 }
    ] },
    emal2k: { when: { cats: ['emal2k'] }, picks: [ // опис 075: «для 2K акрил-поліуретанових емалей, лаків і ґрунтів»
      { label: 'розчинник Palinal', cats: ['rozch'], re: /^Palinal 075\.00\d0\b/i, not: /5\s*л/i, max: 2 },
      { label: 'перехід по блиску', cats: ['rozch'], re: /955 BLEND/i, max: 1 },
      { label: 'знежирювач', cats: ['rozch', 'savex'], re: /знежирювач|антисилікон/i, not: /добавк|additive|hydropal/i, max: 1 },
      Object.assign({ label: 'фарбопульт' }, GUN_ANY)
    ] },
    baza: { when: { cats: ['baza'] }, picks: [ // опис бази: «Наноситься під 2K лак»
      { label: 'лак', cats: ['lak'], not: /5\s*л|мат/i, max: 2 },
      { label: 'перехід по металіку', cats: ['rozch'], re: /900\.FIX1|074\.DS/i, srcRe: /\bMET\b|металік/i, max: 2 },
      { label: 'знежирювач', cats: ['rozch', 'savex'], re: /знежирювач|антисилікон/i, not: /добавк|additive|hydropal/i, max: 1 },
      Object.assign({ label: 'фарбопульт' }, GUN_ANY)
    ] },
    acc: { when: { cats: ['acc'] }, picks: [ // манометри, бачки, PPS, дюзи → інші аксесуари + фарбопульти (бачок/дюза Meiji — лише до Meiji)
      { label: 'аксесуари', cats: ['acc'], max: 3 },
      { label: 'фарбопульти', cats: ['meiji', 'sata', 'china'], not: /ґрунтовоч|міні|spot|0\.8/i, brandLock: true, max: 2 }
    ] },
    shpak: { when: { cats: ['shpak'] }, picks: [
      { label: 'абразиви', cats: ['tools'], re: /шліф|абразив|наждач/i, max: 2 },
      { label: 'знежирювач', cats: ['rozch', 'savex'], re: /знежирювач|антисилікон/i, not: /добавк|additive|hydropal/i, max: 1 }
    ] }
  };
  var REL_BRANDS = /\b(meiji|sata|ntools|devilbiss|iwata|3m)\b/i;
  function relBrand(p) { var m = String(p.name || '').match(REL_BRANDS) || String(p.brand || '').match(REL_BRANDS); return m ? m[1].toLowerCase() : ''; }
  function relSeries(p) { var m = String(p.name || '').match(/\b(\d{3})(?=[.\s])/); return m ? m[1] : ''; }
  function relCodes(p) { return (String(p.name || '') + ' ' + String(p.code || '')).match(/\b\d{3}\.[A-Z0-9]{2,}/gi) || []; }
  function relOut(p) { return /немає/i.test(p.in_stock || ''); }
  function relRank(p) { return (promoOf(p) ? 0 : 2) + (/^в наявності/i.test(p.in_stock || '') ? 0 : 1); } // 0 — позначка + в наявності … 3 — без позначки, наявність уточнюйте / у дорозі
  function relRuleOf(p) {
    var txt = p.name + ' ' + (p.code || '') + ' ' + (p.description || '');
    for (var k in RELATED_RULES) {
      var w = RELATED_RULES[k].when || {};
      if (w.cats && !inCats(p, w.cats)) continue;
      if (w.re && !w.re.test(txt)) continue;
      return k;
    }
    return null;
  }
  function relatedOf(p) {
    var used = {}; used[p.id] = 1;
    var pos = {}; PRODUCTS.forEach(function (x, i) { pos[x.id] = i; });
    var srcTxt = p.name + ' ' + (p.description || ''), srcFlat = srcTxt.replace(/\s+/g, '').toUpperCase();
    var ok = function (x) { return !used[x.id] && !relOut(x) && !x.hidden; };
    var byRank = function (a, b) { return relRank(a) - relRank(b) || pos[a.id] - pos[b.id]; };
    var rk = relRuleOf(p), rule = rk && RELATED_RULES[rk], groups = [], got = {};
    (rule ? rule.picks : []).forEach(function (gp) {
      if (gp.srcRe && !gp.srcRe.test(srcTxt)) return;
      if (gp.srcNot && gp.srcNot.test(srcTxt)) return;
      if (gp.ifEmpty && got[gp.ifEmpty]) return;
      var b = relBrand(p), s = relSeries(p);
      var list = PRODUCTS.filter(function (x) {
        if (!ok(x) || (gp.cats && !inCats(x, gp.cats))) return false;
        var t = x.name + ' ' + (x.code || '');
        if (gp.re && !gp.re.test(t)) return false;
        if (gp.not && gp.not.test(t)) return false;
        if (gp.brandLock && relBrand(x) && relBrand(x) !== b) return false;
        if (gp.sameSeries && !((s && relSeries(x) === s) || relCodes(x).some(function (c) { return srcFlat.indexOf(c.toUpperCase()) >= 0; }))) return false;
        return true;
      }).sort(byRank).slice(0, gp.max || 2);
      got[gp.label] = list.length;
      groups.push(list);
    });
    var out = [], more = true;
    for (var r = 0; more && out.length < REL_MAX; r++) { // по одному з кожної групи по колу — щоб було різноманітно
      more = false;
      groups.forEach(function (l) { if (l[r]) { more = true; if (!used[l[r].id] && out.length < REL_MAX) { used[l[r].id] = 1; out.push(l[r]); } } });
    }
    if (out.length < REL_MIN) {
      PRODUCTS.filter(function (x) { return x.category === p.category && ok(x) && hasPrice(x); }).sort(byRank)
        .slice(0, REL_MIN - out.length).forEach(function (x) { used[x.id] = 1; out.push(x); });
    }
    out.forEach(function (x, i) { x._ri = i; });
    out.sort(function (a, b) { return (promoOf(a) ? 0 : 1) - (promoOf(b) ? 0 : 1) || a._ri - b._ri; });
    return out;
  }
  function relatedHTML(p) {
    var list = relatedOf(p); if (list.length < 2) return '';
    return '<section class="rel" aria-labelledby="rel-ttl"><p class="rel__ttl" id="rel-ttl"><svg class="ico" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="m7.5 4.27 9 5.15"/></svg> Ще купують разом</p>' +
      '<ul class="rel__list">' + list.map(function (x) {
        var pr = unitPrice(x, 0), po = unitOld(x, 0), lb = x.variants && x.variants.length > 1 ? unitLabel(x, 0) : '', pm = promoText(x);
        return '<li class="rel__it"><button class="rel__open" type="button" data-open="' + esc(x.id) + '" aria-label="Відкрити: ' + esc(x.name) + '">' +
          '<span class="rel__img"><img ' + mainImg(x, SZ_SM) + ' alt="" loading="lazy" decoding="async" width="200" height="200">' + (pm ? '<span class="rel__tag">' + esc(pm) + '</span>' : '') + '</span>' +
          '<span class="rel__nm">' + esc(x.name) + '</span>' +
          '<span class="rel__pr">' + (pr != null ? uah(pr) + (po != null ? ' <s class="rel__old">' + uah(po) + '</s>' : '') + (lb ? ' <small>· ' + esc(uahText(lb)) + '</small>' : '') : '<small>Ціну уточнюйте</small>') + '</span></button>' +
          '<button class="rel__add" type="button" data-radd="' + esc(x.id) + '" aria-label="Додати «' + esc(x.name) + '» в кошик">+</button></li>';
      }).join('') + '</ul></section>';
  }
  function renderProduct() {
    spinStop();
    var p = byId[pmState.id];
    var vars = p.variants ? '<div class="vars" role="radiogroup" aria-label="Варіант">' + p.variants.map(function (v, i) {
      return '<button type="button" class="var' + (i === pmState.vi ? ' on' : '') + '" data-var="' + i + '" role="radio" aria-checked="' + (i === pmState.vi) + '">' + esc(uahText(v.label)) + '<b>' + uah(v.price_eur) + (oldOf(v) != null ? ' <s class="var__old">' + uah(oldOf(v)) + '</s>' : '') + '</b></button>';
    }).join('') + '</div>' : '';
    var pmOld = hasPrice(p) ? unitOld(p, pmState.vi) : null;
    var price = hasPrice(p) ? '<span class="pill' + (pmOld != null ? ' pill--sale' : '') + '" style="font-size:22px;padding:7px 16px">' + uah(unitPrice(p, pmState.vi)) + (unitLabel(p, pmState.vi) ? ' <small>· ' + esc(uahText(unitLabel(p, pmState.vi))) + '</small>' : '') + '</span>' + oldHTML(pmOld, unitPrice(p, pmState.vi), 'pold--pm')
      : '<span class="pill pill--ask" style="font-size:16px;padding:7px 16px">Ціну уточнюйте</span>' + (p.price_uah_original ? ' <span class="muted small">у пості: ' + esc(p.price_uah_original) + '</span>' : '');
    var src = (p.source || []).filter(function (u) { return /^https:\/\/t\.me\//.test(u); })[0];
    var tgAsk = 'https://t.me/share/url?url=' + encodeURIComponent('https://t.me/alex_bes_shoping') + '&text=' + encodeURIComponent('Вітаю! Цікавить: ' + p.name + (hasPrice(p) ? '' : ' — яка ціна?'));
    $('#pm').innerHTML =
      galleryHTML(p) +
      '<div class="pm__info">' +
        '<span class="pm__cat">' + esc(p.category_name) + '</span>' +
        '<h2 id="pm-name">' + esc(p.name) + '</h2>' +
        '<div class="pm__tools">' + favBtnHTML(p, 'favb--pm') + '<button class="pmt" type="button" data-share="' + esc(p.id) + '" aria-label="Поділитися: ' + esc(p.name) + '">' + svgI(IC.share, 19) + '<span>Поділитися</span></button></div>' +
        '<div>' + price + '</div>' + vars +
        stockHTML(p) +
        '<div class="pm__buy"><div class="qty"><button type="button" data-q="-1" aria-label="Менше">−</button><input id="pmq" type="number" min="1" value="' + pmState.qty + '" aria-label="Кількість"><button type="button" data-q="1" aria-label="Більше">+</button></div>' +
        '<button class="btn btn--y" type="button" data-addpm><svg class="ico" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg> Додати в кошик</button>' + (isGun(p) ? cmpBtnHTML(p, 'btn cmpt--pm') : '') + '</div>' +
        '<p class="pm__desc">' + pmDesc(p.description) + '</p>' + videosHTML(p) + relatedHTML(p) + // 04.10: ціна → варіанти → наявність → кількість + кошик → опис → «Ще купують разом» // 04.10: кількість + кошик одразу після опису, «Ще купують разом» — під ними
        '<button class="btn btn--1c btn--full" type="button" data-quick="' + esc(p.id) + '">' + svgI(IC.bolt, 18) + 'Купити в один клік</button>' +
        '<div class="cactions">' +
          '<a class="btn btn--bot btn--full" href="' + CONFIG.orderBot + '?start=' + encodeURIComponent(p.id) + '" target="_blank" rel="noopener" data-order="' + esc(p.id) + '"><svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 8V4H8"/><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg> Замовити через бота</a>' +
          '<a class="btn btn--o" href="' + CONFIG.orderTelegram + '" target="_blank" rel="noopener"><svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M14.54 21.69a.5.5 0 0 0 .94-.03l6.5-19a.5.5 0 0 0-.64-.63l-19 6.5a.5.5 0 0 0-.02.93l7.93 3.18a2 2 0 0 1 1.11 1.11z"/><path d="m21.85 2.15-10.94 10.94"/></svg> Telegram</a>' +
          '<a class="btn btn--o" href="' + CONFIG.whatsapp + '?text=' + encodeURIComponent('Вітаю! Цікавить: ' + p.name + (hasPrice(p) ? '' : ' — яка ціна?')) + '" target="_blank" rel="noopener"><svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M9.2 9.1c0 2.9 2.8 5.7 5.7 5.7l1.1-1.3-1.8-.9-.8.8c-1-.4-2.4-1.8-2.8-2.8l.8-.8-.9-1.8z"/></svg> WhatsApp</a>' +
          '<a class="btn btn--o" href="' + CONFIG.viber + '"><svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M13 7.5a3 3 0 0 1 3 3"/><path d="M13 5.5a5 5 0 0 1 5 5"/></svg> Viber</a>' +
          '<a class="btn btn--o" href="' + CONFIG.instagram + '" target="_blank" rel="noopener"><svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="2.5" y="2.5" width="19" height="19" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/></svg> Instagram</a>' +
        '</div>' +
        specsHTML(p) + tdsHTML(p) +
        (p.price_note || src ? '<p class="pm__note">' + esc(uahText(p.price_note || '')) + (src ? (p.price_note ? ' · ' : '') + '<a href="' + src + '" target="_blank" rel="noopener">пост у каналі</a>' : '') + '</p>' : '') +
        pmBarHTML(p) +
      '</div>';
    galInit();
    pmBarWatch();
    fillPhotos();
  }

  /* ---------- cart ---------- */
  function cartCount() { return cart.reduce(function (s, l) { return s + l.qty; }, 0); }
  function addToCart(id, vi, qty, src) {
    vi = vi || 0; qty = Math.max(1, qty || 1);
    var l = cart.filter(function (x) { return x.id === id && x.vi === vi; })[0];
    if (l) l.qty += qty; else cart.push({ id: id, vi: vi, qty: qty });
    lastOrder = null; saveCart(); updateBadges();
    stat('cart', 'cart:' + id + ':' + vi);
    var p = byId[id];
    cartEvent(p, vi, qty, src);
    toast('Додано: ' + p.name + (variantOf(p, vi) ? ' (' + uahText(variantOf(p, vi).label) + ')' : ''));
  }
  function updateBadges() {
    var n = cartCount();
    $$('[data-cart-count]').forEach(function (b) { b.textContent = n; b.hidden = n === 0; });
    var nf = favList().length; // «Вибране» у нижньому меню
    $$('[data-fav-count]').forEach(function (b) { b.textContent = nf > 99 ? '99+' : nf; b.hidden = nf === 0; });
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
    var snap = cart.map(function (l) { return { id: l.id, vi: l.vi, qty: l.qty }; }), stxt = orderText();
    var p = orderWriter(id, data);
    if (!p || typeof p.then !== 'function') return null;
    // 08.10.2026: якщо запис не підтверджено за ORDER_WAIT (немає зв'язку) або відхилено — клієнт бачить у кошику повідомлення
    // з іншими способами (бот з кошиком у посиланні, Telegram, дзвінок). Якщо запис усе ж пройде пізніше — звичайне «Дякуємо!».
    var settled = false, to = setTimeout(function () { if (!settled) orderFailShow('тайм-аут'); }, ORDER_WAIT);
    p.then(function () {
      settled = true; clearTimeout(to); orderFail = null;
      stat('o_botok', 'o_botok:' + id); // «Оформлено»: +1 ЛИШЕ після того, як orders/<id> збережено (кожне замовлення окремо)
      track('бот/кошик-firestore', 'Замовлення з кошика передано боту'); formChanged('order'); orderPlaced(id, snap, stxt);
    }, function (e) {
      settled = true; clearTimeout(to);
      try { console.warn('order doc not saved', e && e.code); } catch (x) {}
      orderFailShow(e && e.code ? e.code : 'помилка запису'); // кошик НЕ чистимо
    });
    return CONFIG.orderBot + '?start=o_' + id + botCartTokens(36); // 2+20+≤36+_mN ≤ 64
  }
  /* ---------- очищення кошика після замовлення (03.10.2026) ----------
     1) замовлення збережено в Firestore (кнопка «Бот для замовлень») → прибираємо з кошика саме замовлені позиції і показуємо «Дякуємо!»;
     2) надсилання через месенджер / копіювання / дзвінок — сайт не знає, чи дійшло: ставимо позначку і при поверненні питаємо «Очистити кошик?» */
  var lastOrder = null; // { id, text, t } — для екрана «Дякуємо!» у кошику
  function orderNo(id) { return String(id).slice(-6); } // в адмінці «Замовлення» — повний id, ці 6 символів — його кінець
  function orderPlaced(id, snap, text) {
    snap.forEach(function (s) {
      for (var i = 0; i < cart.length; i++) if (cart[i].id === s.id && cart[i].vi === s.vi) {
        if (cart[i].qty > s.qty) cart[i].qty -= s.qty; else cart.splice(i, 1); // додали ще після замовлення — залишок лишається
        break;
      }
    });
    saveCart(); updateBadges(); dropPending(); promptHide();
    lastOrder = { id: id, text: text, t: Date.now() };
    if (openModalEl && openModalEl === $('#cmodal')) renderCart();
    else toast('Замовлення №' + orderNo(id) + ' прийнято. Кошик очищено');
  }
  var PENDING_KEY = 'alexbes_cart_pending';
  function cartHash() { var j = JSON.stringify(allLines()), h = 5381; for (var i = 0; i < j.length; i++) h = ((h << 5) + h + j.charCodeAt(i)) | 0; return (h >>> 0).toString(36) + '.' + j.length; }
  function markPending() { if (cart.length) save(PENDING_KEY, { h: cartHash(), t: Date.now(), no: false }); }
  function dropPending() { try { localStorage.removeItem(PENDING_KEY); } catch (e) {} delete mem[PENDING_KEY]; }
  function pendingNow() { // позначка актуальна: < 7 днів, кошик той самий, «Ні, залишити» ще не натискали
    var m = load(PENDING_KEY, null); if (!m || !m.t) return null;
    if (!cart.length || m.h !== cartHash() || Date.now() - m.t > 7 * 864e5) { dropPending(); return null; }
    return m.no ? null : m;
  }
  var CP_ICON = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14l-1.2 11.1a2 2 0 0 1-2 1.9H8.2a2 2 0 0 1-2-1.9z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/><path d="m9.3 14.2 1.9 1.9 3.6-3.8"/></svg>';
  function promptHide() { var el = $('#cprompt'); if (el) { el.classList.remove('on'); setTimeout(function () { if (!el.classList.contains('on')) el.hidden = true; }, 260); } }
  function checkPending() {
    var m = pendingNow(); if (!m) { promptHide(); return; }
    var el = $('#cprompt');
    if (!el) {
      el = document.createElement('div'); el.id = 'cprompt'; el.className = 'cprompt'; el.hidden = true;
      el.setAttribute('role', 'dialog'); el.setAttribute('aria-labelledby', 'cprompt-t'); el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    if (!el.hidden) return;
    var n = cartCount();
    el.innerHTML = '<span class="cprompt__ico">' + CP_ICON + '</span><div class="cprompt__b"><p class="cprompt__t" id="cprompt-t">Замовлення оформлено?</p>' +
      '<p class="cprompt__s">Ви надсилали замовлення з кошика (' + n + ' шт). Очистити кошик?</p>' +
      '<div class="cprompt__a"><button class="btn btn--y" type="button" data-cp-yes>Так, очистити</button><button class="btn btn--o" type="button" data-cp-no>Ні, залишити</button></div></div>';
    el.hidden = false; void el.offsetWidth; el.classList.add('on');
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-cp-yes], [data-cp-no], #cartbody a[href^="tel:"]') : null; if (!t) return;
    if (t.hasAttribute('data-cp-yes')) {
      cart = []; saveCart(); updateBadges(); dropPending(); promptHide(); lastOrder = null; orderFail = null; // невідомі зараз позиції (orphans) не чіпаємо
      if (openModalEl && openModalEl === $('#cmodal')) renderCart();
      toast('Кошик очищено'); track('кошик/очищено-після-замовлення', 'Кошик очищено після замовлення');
    } else if (t.hasAttribute('data-cp-no')) {
      var m = load(PENDING_KEY, null); if (m) { m.no = true; save(PENDING_KEY, m); } promptHide();
    } else markPending(); // дзвінок з кошика
  });
  var hiddenAt = 0;
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (hiddenAt && Date.now() - hiddenAt >= 8000) setTimeout(checkPending, 600); // повернулись із месенджера
  });
  setTimeout(checkPending, 3500); // після завантаження (і синхронізації кошика з акаунтом)
  /* 08.10.2026: замовлення з кошика не збереглося (немає зв'язку / відхилено) — зрозуміле повідомлення в кошику з іншими способами */
  var ORDER_WAIT = 15000, orderFail = null; // { t, why }
  var OF_WARN = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 2.4 17.6A2 2 0 0 0 4.1 20.6h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4.5"/><circle cx="12" cy="16.8" r=".7" fill="currentColor"/></svg>';
  var OF_BOT = '<path d="M12 4v3"/><circle cx="12" cy="3.2" r=".9"/><rect x="4.5" y="7" width="15" height="11.5" rx="3.5"/><circle cx="9.3" cy="12.6" r="1.2"/><circle cx="14.7" cy="12.6" r="1.2"/><path d="M2.5 12v2.5M21.5 12v2.5"/>';
  function orderFailShow(why) {
    if (!cart.length) return;
    orderFail = { t: Date.now(), why: String(why || '') };
    track('бот/кошик-помилка', 'Замовлення з кошика не збереглося (' + orderFail.why + ')');
    if (openModalEl && openModalEl === $('#cmodal')) { renderCart(); var bx = $('#cmodal .modal__box'); if (bx) bx.scrollTop = 0; return; }
    if (location.hash === '#cart') { renderCart(); showModal('#cmodal'); return; }
    if (!/^#\/p\//.test(location.hash)) lastListHash = location.hash || '#/';
    location.hash = '#cart';
  }
  function orderFailHTML() {
    return '<div class="cfail" role="alert">' +
      '<div class="cfail__h"><span class="cfail__ico">' + OF_WARN + '</span><div>' +
        '<h3 class="cfail__t">Замовлення не збереглося на сайті</h3>' +
        '<p class="cfail__s">Схоже, зв’язок із сервером перервався, тому бот міг не отримати ваш кошик. Товари залишилися в кошику — завершіть замовлення зручним способом:</p>' +
      '</div></div>' +
      '<div class="cfail__a">' +
        '<a class="btn btn--bot btn--full" href="' + CONFIG.orderBot + '?start=' + botCartPayload() + '" target="_blank" rel="noopener" data-ofail="bot">' + svgI(OF_BOT, 19) + 'Відкрити бота з кошиком</a>' +
        '<a class="btn btn--y" href="' + CONFIG.orderTelegram + '?text=' + encodeURIComponent(orderText()) + '" target="_blank" rel="noopener" data-ofail="tg">' + svgI(IC.tg, 18) + 'Написати в Telegram</a>' +
        '<a class="btn btn--o" href="tel:' + CONFIG.phone + '" data-ofail="call">' + svgI(IC.phone, 18) + 'Подзвонити</a>' +
      '</div>' +
      '<p class="cfail__n">Телефон: <a href="tel:' + CONFIG.phone + '">' + CONFIG.phoneLabel + '</a>. Уже оформили в боті? <button class="cfail__lnk" type="button" data-cp-yes>Очистити кошик</button></p>' +
    '</div>';
  }
  function orderDoneHTML() {
    var o = lastOrder, no = orderNo(o.id);
    return '<div class="cdone"><span class="cdone__ico" aria-hidden="true"><svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.2"/><path d="m7.8 12.3 2.8 2.8 5.6-5.8"/></svg></span>' +
      '<h3 class="cdone__t">Дякуємо! Замовлення №' + esc(no) + ' прийнято</h3>' +
      '<p class="cdone__s">Ми зв’яжемося з вами, щоб підтвердити ціну, наявність і доставку. Кошик очищено.</p>' +
      '<div class="cactions">' +
        '<a class="btn btn--bot btn--full" href="' + CONFIG.orderBot + '?start=o_' + esc(o.id) + '" target="_blank" rel="noopener"><svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 8V4H8"/><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg> Відкрити бота з замовленням</a>' +
        '<a class="btn btn--y btn--full" href="' + CONFIG.orderTelegram + '?text=' + encodeURIComponent(o.text + '\n\nЗамовлення №' + no) + '" target="_blank" rel="noopener"><svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M14.54 21.69a.5.5 0 0 0 .94-.03l6.5-19a.5.5 0 0 0-.64-.63l-19 6.5a.5.5 0 0 0-.02.93l7.93 3.18a2 2 0 0 1 1.11 1.11z"/><path d="m21.85 2.15-10.94 10.94"/></svg> Написати в Telegram</a>' +
        '<a class="btn btn--o" href="tel:' + CONFIG.phone + '"><svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg> Подзвонити</a>' +
        '<button class="btn btn--o" type="button" data-close>До каталогу</button>' +
      '</div></div>';
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
    if (!cart.length && lastOrder && Date.now() - lastOrder.t < 30 * 60000) { body.innerHTML = orderDoneHTML(); return; }
    if (!cart.length) {
      body.innerHTML = '<div class="cempty"><svg class="ico cempty__ico" viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>Кошик порожній.<br>Додайте товари з каталогу — і надішліть замовлення в Telegram.<br><br><button class="btn btn--y" type="button" data-close>До каталогу</button></div>';
      return;
    }
    var sum = 0, ask = 0, saved = 0;
    var items = cart.map(function (l, i) {
      var p = byId[l.id], v = variantOf(p, l.vi), up = unitPrice(p, l.vi), uo = up != null ? unitOld(p, l.vi) : null;
      if (up != null) sum += toUah(up) * l.qty; else ask++;
      if (uo != null) saved += (toUah(uo) - toUah(up)) * l.qty;
      return '<li class="citem"><img ' + mainImg(p, SZ_SM) + ' alt="" loading="lazy" decoding="async" width="72" height="72">' +
        '<div><div class="citem__n">' + esc(p.name) + '</div><div class="citem__v">' + esc(uahText(v ? v.label : (p.price_label || ''))) + '</div>' +
        '<div class="citem__p">' + (up != null ? uah(up) + ' × ' + l.qty : 'Ціну уточнюйте') + (uo != null ? oldHTML(uo, up, 'pold--sm') : '') + '</div>' +
        (up != null && l.qty > 1 ? '<div class="citem__t">' + fmtUah(toUah(up) * l.qty).replace(/ /g, '\u00a0') + '</div>' : '') + '</div>' +
        '<div class="citem__r"><div class="qty"><button type="button" data-cq="' + i + '" data-d="-1" aria-label="Менше">−</button><input type="number" min="1" value="' + l.qty + '" data-ci="' + i + '" aria-label="Кількість"><button type="button" data-cq="' + i + '" data-d="1" aria-label="Більше">+</button></div>' +
        '<button class="rm" type="button" data-rm="' + i + '">видалити</button></div></li>';
    }).join('');
    var fail = orderFail && Date.now() - orderFail.t < 30 * 60000 ? orderFailHTML() : '';
    body.innerHTML = fail + cstepsHTML() + '<div class="csec" data-csec="1"><ul class="citems">' + items + '</ul>' +
      '<div class="ctotal"><span>Разом' + (ask ? ' <span class="muted small">(+ ' + ask + ' поз. на уточненні)</span>' : '') + '</span><b>' + fmtUah(sum).replace(/ /g, '\u00a0') + '</b></div>' +
      (saved > 0 ? '<div class="csave"><span>Ваша економія зі знижками</span><b>\u2212' + fmtUah(saved).replace(/ /g, '\u00a0') + '</b></div>' : '') +
      '<p class="cnote">Ціни в гривнях. Остаточну ціну, наявність, доставку та оплату підтверджуємо в Telegram або телефоном.</p></div>' +
      '<div class="csec" data-csec="2"><h3 class="csec__ttl"><span>2</span>Ваші дані</h3>' +
      '<div class="cform">' +
        '<label>Ім’я<input data-f="name" value="' + esc(form.name || '') + '" autocomplete="name"></label>' +
        '<label>Телефон<input data-f="phone" value="' + esc(form.phone || '') + '" type="tel" autocomplete="tel"></label>' +
        '<label class="full">Місто / доставка<input data-f="city" value="' + esc(form.city || '') + '" placeholder="Місто, спосіб доставки"></label>' +
        '<label class="full">Коментар<textarea data-f="note" rows="2" placeholder="Дюза, система, питання…">' + esc(form.note || '') + '</textarea></label>' +
      '</div></div>' +
      '<div class="csec" data-csec="3"><h3 class="csec__ttl"><span>3</span>Надіслати замовлення</h3>' +
      '<details class="preview preview--top"><summary><svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 20h9"/><path d="M16.38 3.62a1 1 0 0 1 3 3L7.37 18.64a2 2 0 0 1-.86.5l-2.87.84a.5.5 0 0 1-.62-.62l.84-2.87a2 2 0 0 1 .5-.85z"/></svg> Текст замовлення</summary><pre id="otext"></pre></details>' +
      '<div class="cactions">' +
        '<a class="btn btn--bot btn--full" href="' + CONFIG.orderBot + '?start=' + botCartPayload() + '" target="_blank" rel="noopener" data-botcart><svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 8V4H8"/><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg> Бот для замовлень</a>' +
        '<button class="btn btn--y btn--full" type="button" data-send><svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M14.54 21.69a.5.5 0 0 0 .94-.03l6.5-19a.5.5 0 0 0-.64-.63l-19 6.5a.5.5 0 0 0-.02.93l7.93 3.18a2 2 0 0 1 1.11 1.11z"/><path d="m21.85 2.15-10.94 10.94"/></svg> Надіслати в Telegram</button>' +
        '<button class="btn btn--y" type="button" data-wa><svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M9.2 9.1c0 2.9 2.8 5.7 5.7 5.7l1.1-1.3-1.8-.9-.8.8c-1-.4-2.4-1.8-2.8-2.8l.8-.8-.9-1.8z"/></svg> WhatsApp</button>' +
        '<button class="btn btn--y" type="button" data-viber><svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M13 7.5a3 3 0 0 1 3 3"/><path d="M13 5.5a5 5 0 0 1 5 5"/></svg> Viber</button>' +
        '<button class="btn btn--b" type="button" data-ig><svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="2.5" y="2.5" width="19" height="19" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/></svg> Instagram</button>' +
        '<button class="btn btn--o" type="button" data-copy><svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg> Скопіювати текст</button>' +
        '<a class="btn btn--o btn--full" href="tel:' + CONFIG.phone + '"><svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg> Подзвонити ' + CONFIG.phoneLabel + '</a>' +
      '</div>' +
      '<p class="cnote" style="margin-top:10px">Оберіть зручний месенджер. У Telegram, WhatsApp і Viber текст замовлення підставиться сам — просто натисніть «Надіслати».</p></div>' +
      CTRUST_HTML;
    $('#otext').textContent = orderText();
    fillPhotos();
  }
  /* преміум-кошик (03.10.2026): індикатор кроків + рядок довіри — лише відображення, логіка замовлення без змін */
  var CSTEPS = ['Кошик', 'Дані', 'Надсилання'];
  function cstepsHTML() {
    return '<ol class="csteps" aria-label="Кроки оформлення">' + CSTEPS.map(function (n, i) {
      return '<li><button type="button" class="cstep' + (i === 0 ? ' on' : '') + '" data-cstep="' + (i + 1) + '"' + (i === 0 ? ' aria-current="step"' : '') + '><span>' + (i + 1) + '</span>' + n + '</button></li>';
    }).join('') + '</ol>';
  }
  function cstepSet(n) {
    $$('#cartbody [data-cstep]').forEach(function (b) { var k = +b.getAttribute('data-cstep'); b.classList.toggle('on', k === n); b.classList.toggle('done', k < n); if (k === n) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
  }
  var CTRUST_HTML = '<ul class="ctrust">' +
    '<li><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6l7-3z"/><path d="m8.8 12.2 2.2 2.2 4.4-4.6"/></svg>Офіційний представник Meiji і PALINAL</li>' +
    '<li><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9z"/><path d="m3 7.5 9 4.5 9-4.5M12 12v9"/></svg>Нова пошта</li>' +
  '</ul>';
  document.addEventListener('focusin', function (e) { var s = e.target.closest && e.target.closest('#cartbody [data-csec]'); if (s) cstepSet(+s.getAttribute('data-csec')); });
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
    if (openModalEl !== $(sel)) lastFocus = document.activeElement; // повторний показ тієї ж модалки (інший товар) — фокус повертаємо туди, звідки її відкрили
    openModalEl = $(sel); openModalEl.hidden = false; document.body.style.overflow = 'hidden';
    var x = openModalEl.querySelector('.modal__x'); if (x) x.focus({ preventScroll: true });
  }
  function hideModal() {
    sheetClose();
    if (!openModalEl) return;
    lbHide();
    stopMedia(); spinStop();
    openModalEl.hidden = true; openModalEl = null; document.body.style.overflow = ''; trackedOpen = null;
    document.title = listTitle();
    if (/^#\/p\/|^#cart|^#compare|^#pick|^#code/.test(location.hash)) history.replaceState(null, '', lastListHash);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  var tt;
  function toast(msg) { var t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(tt); tt = setTimeout(function () { t.hidden = true; }, 2600); }

  /* ---------- «Підібрати фарбопульт» (#pick): 4 кроки -> 1–3 фарбопульти з каталогу ----------
     Дюзи та витрата повітря — лише з характеристик товарів (gun_specs.py / data). Загальні рекомендації дюз:
     база 1,2–1,3 · лак 1,3–1,4 · ґрунт 1,6–1,8 · дрібний ремонт — міні-пістолет. */
  var PK_MAT = {
    base: { t: 'База', s: 'базове покриття під лак', nz: '1,2–1,3 мм' },
    clear: { t: 'Лак', s: 'прозорий лак, фінішний шар', nz: '1,3–1,4 мм' },
    primer: { t: 'Ґрунт', s: 'ґрунти й наповнювачі', nz: '1,6–1,8 мм' },
    spot: { t: 'Дрібний ремонт', s: 'локальне підфарбовування', nz: 'міні-пістолет' }
  };
  var PK_AIR = [{ k: 250, t: 'До 250 л/хв', s: 'невеликий компресор' }, { k: 350, t: '250–350 л/хв', s: 'середній компресор' }, { k: 9999, t: 'Понад 350 л/хв', s: 'потужний компресор' }, { k: 0, t: 'Не знаю', s: 'підберемо без цього' }];
  var PK_BUD = [{ k: 'lo', lo: 0, hi: 5000, t: 'До 5 000 грн' }, { k: 'mid', lo: 5000, hi: 16000, t: '5 000–16 000 грн' }, { k: 'hi', lo: 16000, hi: 30000, t: '16 000–30 000 грн' }, { k: 'top', lo: 30000, hi: 1e9, t: 'Без обмежень', s: 'преміум-клас' }];
  var PK_BR = [{ k: 'meiji', t: 'Meiji', s: 'Японія' }, { k: 'sata', t: 'SATA', s: 'Німеччина' }, { k: 'china', t: 'Бюджетні', s: 'Китай' }, { k: 'any', t: 'Будь-який', s: 'головне — результат' }];
  // u: для чого підходить (за призначенням і дюзами з характеристик); a: витрата повітря, л/хв (з даних виробника; null — не вказана); n: дюзи
  var PK_GUNS = [
    { id: 'meiji-finer-core', u: { base: 1, clear: 1 }, a: 300, an: 'SP — 300 · HVLP — 380 л/хв', n: '1,3 або 1,5 мм (SP / HVLP)' },
    { id: 'sata-jet-x-pro', u: { base: 1, clear: 1 }, a: 330, n: '1,2 або 1,3 мм' },
    { id: 'meiji-f410', u: { base: 1, clear: 1, primer: 1 }, a: { base: 280, clear: 290, primer: 325 }, an: { base: '1,2 — 270 · 1,3 — 280 л/хв', clear: '1,4 — 290 л/хв', primer: '1,8 — 325 л/хв' }, n: '1,0–2,5 мм (серія EV)', nf: { base: '1,2 або 1,3 мм', clear: '1,4 мм', primer: '1,8 мм' } },
    { id: 'meiji-finer-3', u: { clear: 1 }, a: 220, n: '1,4 мм' },
    { id: 'meiji-finer-2-plus-g14', u: { base: 1, clear: 1 }, a: 220, n: '1,4 мм (бічний бачок)', alt: { base: 'Дюза 1,4 мм — за даними Meiji, для баз металік і перламутр' } },
    { id: 'meiji-finer-core-black', u: { base: 1, clear: 1 }, a: 300, an: 'SP — 300 · HVLP — 380 л/хв', n: '1,3 або 1,5 мм (SP / HVLP)' },
    { id: 'meiji-finer-core-liberty-walk', u: { base: 1, clear: 1 }, a: 300, an: 'SP — 300 · HVLP — 380 л/хв', n: '1,3 або 1,5 мм (SP / HVLP)' },
    { id: 'meiji-finer-core-sv17', u: { base: 1 }, a: 275, n: '1,7 мм', alt: { base: 'Для водних баз і HS-матеріалів (дюза 1,7 мм)' } },
    { id: 'sata-100b', u: { primer: 1 }, a: 290, n: '1,4 мм (RP) — для ґрунтів і наповнювачів' },
    { id: 'spi-pro-te20-sticker-bomb', u: { base: 1, clear: 1 }, a: 300, n: '1,3 мм' },
    { id: 'ntools-5000b-upgrades', u: { base: 1, clear: 1 }, a: null, n: '1,3 мм (HVLP)' },
    { id: 'gun-hvlp-13', u: { base: 1, clear: 1 }, a: null, n: '1,3 мм (HVLP)' },
    { id: 'gun-pps-set', u: { base: 1, clear: 1, primer: 1 }, a: null, n: '1,3 · 1,4 · 1,7 · 1,8 мм (PPS)', nf: { base: '1,3 мм', clear: '1,4 мм', primer: '1,7 або 1,8 мм' } },
    { id: 'gun-primer-17-pps', u: { primer: 1 }, a: null, n: '1,7 мм (PPS)' },
    { id: 'meiji-finer-spot', u: { spot: 1 }, a: 80, n: '1,2 мм (міні-джет)' },
    { id: 'ntools-mini-5002', u: { spot: 1 }, a: 200, n: '1,2 мм (HVLP, міні)' }
  ];
  var PK_IC = {
    base: '<path d="M12 3 3 7.5 12 12l9-4.5L12 3Z"/><path d="m3 12 9 4.5 9-4.5"/><path d="m3 16.5 9 4.5 9-4.5"/>',
    clear: '<path d="M12 3.2c3.4 4.1 5.6 7.2 5.6 10.1a5.6 5.6 0 0 1-11.2 0c0-2.9 2.2-6 5.6-10.1Z"/><path d="M9.6 14.2a2.6 2.6 0 0 0 2.2 2.4"/>',
    primer: '<rect x="3" y="4" width="18" height="6.5" rx="1.2"/><rect x="3" y="13.5" width="8" height="6.5" rx="1.2"/><rect x="13" y="13.5" width="8" height="6.5" rx="1.2"/>',
    spot: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
    air: '<path d="M3 8.5h11a3 3 0 1 0-3-3"/><path d="M3 12.5h15a3 3 0 1 1-3 3"/><path d="M3 16.5h7"/>',
    bud: '<rect x="2.5" y="6" width="19" height="12.5" rx="2.2"/><path d="M2.5 10h19"/><path d="M6.5 15h4"/>',
    brand: '<path d="M12 2.8 14.6 8l5.7.8-4.1 4 1 5.7-5.2-2.7-5.1 2.7 1-5.7-4.2-4 5.8-.8L12 2.8Z"/>',
    ok: '<path d="m5 12.5 4.2 4.2L19 7"/>', warn: '<path d="M12 8v5"/><circle cx="12" cy="16.5" r=".6" fill="currentColor"/><path d="M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>',
    back: '<path d="M15 5 8 12l7 7"/>', tg: '<path fill="currentColor" stroke="none" d="M21.9 4.3 18.7 19.4c-.2 1.1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6.2 13.1l-4.8-1.5c-1-.3-1.1-1 .2-1.5L20.5 2.9c.9-.3 1.6.2 1.4 1.4Z"/>'
  };
  function pkIc(k, sz) { return '<svg viewBox="0 0 24 24" width="' + (sz || 24) + '" height="' + (sz || 24) + '" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + PK_IC[k] + '</svg>'; }
  var pk = { step: 0, mat: null, air: null, bud: null, br: null };
  var PK_STEPS = [
    { key: 'mat', ic: 'base', q: 'Що будете фарбувати?', opts: function () { return Object.keys(PK_MAT).map(function (k) { return { v: k, t: PK_MAT[k].t, s: PK_MAT[k].s, ic: k }; }); } },
    { key: 'air', ic: 'air', q: 'Скільки повітря дає ваш компресор?', note: 'Витрата повітря фарбопульта — з даних виробника. Компресор краще мати із запасом.', opts: function () { return PK_AIR.map(function (o) { return { v: o.k, t: o.t, s: o.s, ic: 'air' }; }); } },
    { key: 'bud', ic: 'bud', q: 'Який бюджет на фарбопульт?', opts: function () { return PK_BUD.map(function (o) { return { v: o.k, t: o.t, s: o.s || '', ic: 'bud' }; }); } },
    { key: 'br', ic: 'brand', q: 'Якому бренду надаєте перевагу?', opts: function () { return PK_BR.map(function (o) { return { v: o.k, t: o.t, s: o.s, ic: 'brand' }; }); } }
  ];
  function pkGroup(p) { var s = p.sub || p.category; return s === 'meiji' ? 'meiji' : s === 'sata' ? 'sata' : 'china'; }
  function pkPick() {
    var mat = pk.mat, bud = PK_BUD.filter(function (b) { return b.k === pk.bud; })[0] || PK_BUD[3];
    var out = [];
    PK_GUNS.forEach(function (g, i) {
      var p = byId[g.id]; if (!p || !g.u[mat]) return;
      var air = g.a && typeof g.a === 'object' ? g.a[mat] : g.a, price = hasPrice(p) ? toUah(unitPrice(p, 0)) : null, miss = [];
      if (pk.air && air && air > pk.air) miss.push('Потрібно ' + air + ' л/хв повітря — більше, ніж дає ваш компресор');
      if (price != null && price > bud.hi) miss.push('Дорожче за обраний бюджет');
      if (pk.br !== 'any' && pkGroup(p) !== pk.br) miss.push('Інший бренд');
      var inBand = price == null || price >= bud.lo ? 0 : 1;
      out.push({ g: g, p: p, air: air, miss: miss, score: miss.length * 10 + inBand * 3 + (g.alt && g.alt[mat] ? 4 : 0) + (/^в наявності/i.test(p.in_stock || '') ? 0 : 1), i: i });
    });
    out.sort(function (a, b) { return a.score - b.score || a.i - b.i; });
    return out.slice(0, 3);
  }
  function renderPick() {
    var body = $('#pickbody'); if (!body) return;
    if (pk.step < PK_STEPS.length) {
      var st = PK_STEPS[pk.step];
      body.innerHTML = '<div class="pk__top">' +
        (pk.step ? '<button class="pk__back" type="button" data-pk-back aria-label="Назад">' + pkIc('back', 20) + '</button>' : '<span class="pk__back pk__back--ph"></span>') +
        '<div class="pk__prog" aria-hidden="true">' + PK_STEPS.map(function (s, i) { return '<span class="' + (i <= pk.step ? 'on' : '') + '"></span>'; }).join('') + '</div>' +
        '<span class="pk__cnt">Крок ' + (pk.step + 1) + ' з ' + PK_STEPS.length + '</span></div>' +
        '<h3 class="pk__q">' + st.q + '</h3>' +
        '<div class="pk__opts">' + st.opts().map(function (o) {
          var on = String(pk[st.key]) === String(o.v);
          return '<button class="pk__opt' + (on ? ' on' : '') + '" type="button" data-pk-v="' + esc(String(o.v)) + '"><span class="pk__ic">' + pkIc(o.ic) + '</span><span class="pk__ot"><b>' + esc(o.t) + '</b>' + (o.s ? '<span>' + esc(o.s) + '</span>' : '') + '</span></button>';
        }).join('') + '</div>' +
        (st.note ? '<p class="pk__note">' + esc(st.note) + '</p>' : '');
      return;
    }
    var res = pkPick(), m = PK_MAT[pk.mat], exact = res.length && !res[0].miss.length;
    var html = '<div class="pk__top"><button class="pk__back" type="button" data-pk-back aria-label="Назад">' + pkIc('back', 20) + '</button><div class="pk__prog" aria-hidden="true">' + PK_STEPS.map(function () { return '<span class="on"></span>'; }).join('') + '</div><span class="pk__cnt">Готово</span></div>' +
      '<h3 class="pk__q">' + (exact ? 'Вам підійде' : 'Точного збігу немає — найближчі варіанти') + '</h3>' +
      '<p class="pk__sum">' + esc(m.t) + ' · рекомендована дюза: <b>' + esc(m.nz) + '</b></p><div class="pk__res">';
    html += res.map(function (r, k) {
      var p = r.p, g = r.g, nz = g.nf && g.nf[pk.mat] ? g.nf[pk.mat] : g.n, an = g.an && typeof g.an === 'object' ? g.an[pk.mat] : g.an;
      return '<div class="pk__card' + (k === 0 && !r.miss.length ? ' pk__card--top' : '') + '">' +
        '<button class="pk__img" type="button" data-open="' + esc(p.id) + '" aria-label="' + esc(p.name) + '"><img ' + mainImg(p, SZ_SM) + ' alt="' + esc(p.name) + '" width="200" height="200" loading="lazy"></button>' +
        '<div class="pk__cb"><button class="pk__name" type="button" data-open="' + esc(p.id) + '">' + esc(p.name) + '</button>' +
        '<div class="pk__price">' + pillHTML(p) + '</div>' +
        '<ul class="pk__facts"><li><span>Дюза</span>' + esc(nz) + '</li><li><span>Повітря</span>' + (an ? esc(an) : r.air ? r.air + ' л/хв' : 'уточнюйте в Telegram') + '</li></ul>' +
        (g.alt && g.alt[pk.mat] ? '<p class="pk__hint">' + esc(g.alt[pk.mat]) + '</p>' : '') + (r.miss.length ? '<p class="pk__miss">' + pkIc('warn', 15) + esc(r.miss.join(' · ')) + '</p>' : '<p class="pk__ok">' + pkIc('ok', 15) + 'Підходить за всіма параметрами</p>') +
        '</div></div>';
    }).join('');
    html += '</div><div class="pk__end"><a class="btn btn--bot btn--full" href="' + esc(CONFIG.orderTelegram + '?text=' + encodeURIComponent('Вітаю! Підбираю фарбопульт: ' + m.t.toLowerCase() + ', компресор — ' + (PK_AIR.filter(function (o) { return o.k === pk.air; })[0] || PK_AIR[3]).t.toLowerCase() + ', бюджет — ' + (PK_BUD.filter(function (o) { return o.k === pk.bud; })[0] || PK_BUD[3]).t.toLowerCase() + '. Варіанти з сайту: ' + res.map(function (r) { return r.p.name; }).join('; ') + '. Підкажіть, будь ласка, що краще взяти.')) + '" target="_blank" rel="noopener" data-pk-tg>' + pkIc('tg', 18) + '<span>Уточнити в Telegram</span></a>' +
      '<button class="btn btn--o btn--full" type="button" data-pk-again>Пройти ще раз</button>' +
      '<p class="pk__note">Підбір орієнтовний: дюзу й систему під ваш матеріал і компресор підкажемо в Telegram.</p></div>';
    body.innerHTML = html;
    track('підбір/' + pk.mat, 'Підбір фарбопульта: ' + [pk.mat, pk.air, pk.bud, pk.br].join(' / ') + ' → ' + res.map(function (r) { return r.p.id; }).join(', '));
  }
  function pickClick(t) {
    if (t.hasAttribute('data-pk-v')) {
      var st = PK_STEPS[pk.step], v = t.getAttribute('data-pk-v');
      pk[st.key] = st.key === 'air' ? +v : v; pk.step++; renderPick();
      var bx = $('#pickmodal .modal__box'); if (bx) bx.scrollTop = 0;
      return true;
    }
    if (t.hasAttribute('data-pk-back')) { pk.step = Math.max(0, pk.step - 1); renderPick(); return true; }
    if (t.hasAttribute('data-pk-again')) { pk = { step: 0, mat: null, air: null, bud: null, br: null }; renderPick(); return true; }
    return false;
  }

  /* ---------- routing ---------- */
  function route() {
    var h = location.hash || '#/';
    sheetClose();
    var m;
    if ((m = h.match(/^#\/p\/([\w-]+)/))) {
      if (PROD_ALIAS[m[1]] && !byId[m[1]]) { h = '#/p/' + PROD_ALIAS[m[1]]; try { history.replaceState(null, '', h); } catch (e) {} m = h.match(/^#\/p\/([\w-]+)/); }
      if (!$('#grid').children.length) renderGrid(); // direct product link: have the catalog ready behind the modal
      if (byId[m[1]]) { openProduct(m[1]); return; }
      if (openModalEl) { openModalEl.hidden = true; openModalEl = null; document.body.style.overflow = ''; } // unknown/hidden product (maybe loads from Firestore later)
      return;
    }
    if (h === '#cart') { renderCart(); showModal('#cmodal'); return; }
    if (h === '#code') { renderCode(); showModal('#codemodal'); track('код-фарби', 'Фарба за кодом: відкрито'); var ci0 = $('#cs-code'); if (ci0 && window.innerWidth > 760) setTimeout(function () { ci0.focus({ preventScroll: true }); }, 60); return; }
    if (h === '#pick') { renderPick(); showModal('#pickmodal'); track('підбір', 'Підбір фарбопульта: відкрито'); return; }
    if (h === '#compare') { if (!$('#grid').children.length) renderGrid(); renderCompare(); showModal('#cmpmodal'); track('порівняння', 'Порівняння фарбопультів (' + cmpList().length + ')'); return; }
    if (openModalEl) { stopMedia(); openModalEl.hidden = true; openModalEl = null; document.body.style.overflow = ''; }
    trackedOpen = null;
    if (h === '#how') { $$('[data-nav]').forEach(function (a) { a.classList.toggle('on', a.getAttribute('data-nav') === 'how'); }); return; }
    var navOn = /^#\/c\/sale/.test(h) ? 'sale' : /^#\/c\/fav/.test(h) ? 'fav' : 'catalog';
    $$('[data-nav]').forEach(function (a) { a.classList.toggle('on', a.getAttribute('data-nav') === navOn); });
    var prevCat = state.cat;
    var prevBrand = state.brand, prevSub = state.sub; state.brand = ''; state.sub = '';
    var CRE = /^#\/c\/([\w-]+)(?:\/([\w-]+))?(?:\/([\w-]+))?/;
    if ((m = h.match(CRE)) && CAT_ALIAS[m[1]] && !catById[m[1]]) { // старі посилання: розділи фарбопультів, Palinal-розділи
      var al = CAT_ALIAS[m[1]], nh = '#/c/' + al[0] + (al[1] ? '/' + al[1] : '');
      try { history.replaceState(null, '', nh); } catch (e) {}
      h = nh; m = h.match(CRE);
    }
    if (m && ((catById[m[1]] && catById[m[1]].count > 0) || m[1] === 'sale' || m[1] === 'new' || m[1] === 'fav')) { // 08.10: розділ без видимих товарів (напр. «ПДР», усі hidden) -> «Усі товари» // 08.10: #/c/excl більше немає -> «Усі товари»
      state.cat = m[1];
      [m[2], m[3]].forEach(function (seg) {
        if (!seg) return;
        if (subItem(m[1], seg)) state.sub = seg;
        else if (m[1] === 'guns' && GUN_BRANDS.some(function (b) { return b.k === seg; })) state.brand = seg;
      });
    } else state.cat = 'all';
    if (prevCat === 'fav' || state.cat === 'fav') { renderCats(); }
    renderRecent();
    lastListHash = h;
    renderGrid();
    var wantScroll = !catScrollSkip && (catScrollPending || (routedOnce && (prevCat !== state.cat || prevBrand !== state.brand || prevSub !== state.sub)));
    catScrollPending = catScrollSkip = false; routedOnce = true;
    if (wantScroll) scrollToResults();
  }

  /* ---------- вибір розділу → плавно до товарів цього розділу (а не на верх сторінки) ---------- */
  var routedOnce = false, catScrollPending = false, catScrollSkip = false;
  function reducedMotion() { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function stickyOffset() { // висота того, що липне до верху екрана (шапка зараз не sticky — враховується лише якщо знову стане)
    var off = 0;
    ['.hdr', '#chips'].forEach(function (sel) {
      var el = $(sel); if (!el) return;
      var cs = getComputedStyle(el), r = el.getBoundingClientRect();
      if (!r.height || cs.display === 'none') return;
      if (cs.position === 'sticky') off = Math.max(off, (parseFloat(cs.top) || 0) + r.height);
      else if (cs.position === 'fixed' && r.top < window.innerHeight / 2) off = Math.max(off, r.bottom);
    });
    return off;
  }
  function scrollToResults() {
    var bar = $('.results .toolbar'), card = $('#grid > li'), el = bar || card || $('#grid');
    if (!el) return;
    var off = stickyOffset() + 12, y = el.getBoundingClientRect().top + window.scrollY - off;
    if (card && el !== card) { var cy = card.getBoundingClientRect().top + window.scrollY - off; if (cy - y > window.innerHeight * 0.4) y = cy; } // довгий інтро розділу — одразу до першої картки
    var top = Math.max(0, Math.round(y)), y0 = window.scrollY, rm = reducedMotion();
    window.scrollTo({ top: top, behavior: rm ? 'instant' : 'smooth' });
    // страховка: Chrome інколи «глушить» програмну плавну прокрутку (напр. після закриття аркуша) — тоді просто стрибок
    if (!rm && Math.abs(top - y0) > 4) setTimeout(function () { if (Math.abs(window.scrollY - y0) < 2) window.scrollTo({ top: top, behavior: 'instant' }); }, 180);
  }
  function isCatHref(h) { return h === '#/' || h === '' || /^#\/c\/[\w-]+(\/[\w-]+)?$/.test(h); }

  /* ---------- порівняння фарбопультів (до 3 шт., localStorage) ----------
     Характеристики НЕ вигадуємо: лише те, що є в назві, описі та p.specs.rows товару. Немає значення — «—». */
  var CMP_MAX = 3, CMP_KEY = 'alexbes_compare';
  var GUN_CATS = { meiji: 1, sata: 1, china: 1, guns2: 1 }; // підгрупи (p.sub) розділу «guns»: Meiji / SATA / Китай (NTools тощо) / ITALCO, Auarita; 'air' — обдувні, антигравій, антистатик
  var NOT_GUN = { 'sata-qmr-5500': 1 }; // аксесуари — без кнопки «Порівняти»
  function isGun(p) { return !!p && !!GUN_CATS[p.sub || p.category] && !NOT_GUN[p.id]; }
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
    return '<button class="cmpt' + (cls ? ' ' + cls : '') + (on ? ' on' : '') + '" type="button" data-cmp="' + esc(p.id) + '" aria-pressed="' + on + '" title="Порівняти фарбопульти (до ' + CMP_MAX + ')">' + (on ? '✓ У порівнянні' : '<svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/></svg> Порівняти') + '</button>';
  }
  function cmpSync() {
    var list = cmpList(), n = list.length;
    $$('[data-cmp]').forEach(function (b) {
      var on = list.indexOf(b.getAttribute('data-cmp')) >= 0;
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); b.innerHTML = on ? '✓ У порівнянні' : '<svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/></svg> Порівняти';
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
      body.innerHTML = '<div class="cempty"><svg class="ico cempty__ico" viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/></svg>Ще нічого не обрано.<br>Натисніть «Порівняти» на картці фарбопульта — можна до ' + CMP_MAX + ' шт.<br><br><a class="btn btn--y" href="#/c/guns">До фарбопультів</a></div>';
      return;
    }
    var specs = list.map(gunSpecs), n = list.length;
    var head = '<div class="cmp__l cmp__l--h">Фарбопульт</div>' + list.map(function (p) {
      return '<div class="cmp__h">' +
        '<button class="cmp__rm" type="button" data-cmp-rm="' + esc(p.id) + '" aria-label="Прибрати «' + esc(p.name) + '» з порівняння">✕</button>' +
        '<button class="cmp__img" type="button" data-open="' + esc(p.id) + '" aria-label="' + esc(p.name) + '"><img ' + mainImg(p, SZ_SM) + ' alt="' + esc(p.name) + '" width="200" height="200"></button>' +
        '<span class="cmp__cat">' + esc(p.category_name) + '</span>' +
        '<button class="cmp__name" type="button" data-open="' + esc(p.id) + '">' + esc(p.name) + '</button>' +
        '<div class="cmp__price">' + pillHTML(p) + '</div>' +
        '<button class="btn btn--y cmp__add" type="button" data-add="' + esc(p.id) + '"><svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg> В кошик</button>' +
      '</div>';
    }).join('');
    var rowsHTML = CMP_ROWS.filter(function (r) { return specs.some(function (s) { return s[r[0]]; }); }).map(function (r) {
      return '<div class="cmp__l">' + esc(r[1]) + '</div>' + specs.map(function (s) {
        return '<div class="cmp__v' + (s[r[0]] ? '' : ' cmp__v--na') + '">' + esc(s[r[0]] || '—') + '</div>';
      }).join('');
    }).join('');
    var stock = '<div class="cmp__l">Наявність</div>' + list.map(function (p) { return '<div class="cmp__v">' + stockHTML(p) + '</div>'; }).join('');
    body.innerHTML = (n < 2 ? '<p class="cmp__hint">Додайте ще ' + (n === 1 ? 'один-два фарбопульти' : '') + ' — кнопка «Порівняти» на картці товару.</p>' : '') +
      '<div class="cmp" style="--n:' + n + '">' + head + rowsHTML + stock + '</div>' +
      '<p class="cnote cmp__note">Характеристики — з опису товару та даних виробника на сайті; «—» означає, що даних немає. Дюзу, систему та комплектацію уточнюйте в Telegram.</p>' +
      '<div class="cmp__acts"><button class="btn btn--o" type="button" data-cmp-clear><svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg> Очистити</button><a class="btn btn--y" href="#/c/guns">+ Додати ще</a></div>';
    fillPhotos();
  }

  /* ---------- events ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('button, a');
    if (!t) {
      if (e.target.hasAttribute && e.target.hasAttribute('data-close')) { hideModal(); return; }
      if (!lb.open && e.target.closest && e.target.closest('#pm .pm__img.is-zoomable') && !e.target.closest('.spin')) lbOpen(pmGalIndex()); // тап по головному фото → повний екран
      return;
    }
    if (t.hasAttribute('data-lb-close')) { lbClose(); return; }
    if (t.hasAttribute('data-lb-step')) { lbGo(+t.getAttribute('data-lb-step'), true); return; }
    if (t.hasAttribute('data-lb-open')) { lbOpen(pmGalIndex()); return; }
    if (t.hasAttribute('data-spin-open')) { spinOpen(); return; }
    if (t.hasAttribute('data-spin-close')) { spinStop(); var sb = $('#pm .pm__360'); if (sb) sb.focus({ preventScroll: true }); return; }
    statClick(t);
    if (t.hasAttribute('data-close')) { e.preventDefault(); hideModal(); return; }
    if (t.hasAttribute('data-map')) { track('карта', 'Як доїхати (Google Maps, ST Service)'); return; } // repair banner: link opens Google Maps in a new tab
    if (t.hasAttribute('data-consult')) { track('консультація', 'Отримати консультацію (Telegram Alex)'); return; } // home banner button; link opens normally
    if (t.hasAttribute('data-order')) { var op = byId[t.getAttribute('data-order')]; if (op) track('замовити/' + op.id, 'Замовити: ' + op.name); return; } // no preventDefault: link opens the bot as usual
    if (t.hasAttribute('data-open')) { location.hash = '#/p/' + t.getAttribute('data-open'); return; }
    if (t.hasAttribute('data-add')) {
      var p = byId[t.getAttribute('data-add')];
      if (p.variants && p.variants.length > 1) { location.hash = '#/p/' + p.id; toast('Оберіть варіант'); return; }
      addToCart(p.id, 0, 1, cartSrc(t)); return;
    }
    if (t.hasAttribute('data-radd')) { var rp = byId[t.getAttribute('data-radd')]; if (rp) addToCart(rp.id, 0, 1, cartSrc(t)); return; } // «Ще купують разом»: в кошик без закриття картки (варіант 1)
    if (t.hasAttribute('data-var')) { pmState.vi = +t.getAttribute('data-var'); renderProduct(); return; }
    if (t.hasAttribute('data-gal-step')) { galGo(+t.getAttribute('data-gal-step'), true); return; }
    if (t.hasAttribute('data-gal-to')) { galGo(+t.getAttribute('data-gal-to'), false); return; }
    if (t.hasAttribute('data-vid')) { playVideo(+t.getAttribute('data-vid')); return; }
    if (t.hasAttribute('data-vid-link')) { var vp = byId[pmState.id]; if (vp) track('відео/' + vp.id, 'Відео (посилання): ' + vp.name); return; }
    if (t.hasAttribute('data-q')) { pmState.qty = Math.max(1, (parseInt($('#pmq').value, 10) || 1) + +t.getAttribute('data-q')); $('#pmq').value = pmState.qty; return; }
    if (t.hasAttribute('data-addpm')) { pmState.qty = Math.max(1, parseInt($('#pmq').value, 10) || 1); addToCart(pmState.id, pmState.vi, pmState.qty, cartSrc(t)); return; }
    if (t.hasAttribute('data-cmp')) { toggleCmp(t.getAttribute('data-cmp')); return; }
    if (t.hasAttribute('data-cmp-rm')) { var ri = cmpIds.indexOf(t.getAttribute('data-cmp-rm')); if (ri >= 0) cmpIds.splice(ri, 1); cmpSave(); cmpSync(); renderCompare(); return; }
    if (t.hasAttribute('data-cmp-clear')) { cmpIds = []; cmpSave(); cmpSync(); if (openModalEl && openModalEl === $('#cmpmodal')) renderCompare(); toast('Порівняння очищено'); return; }
    if (pickClick(t)) return;
    if (t.hasAttribute('data-open-pick')) { e.preventDefault(); if (location.hash !== '#pick') { if (!/^#\/p\/|^#cart|^#compare|^#code/.test(location.hash)) lastListHash = location.hash || '#/'; location.hash = '#pick'; } else { renderPick(); showModal('#pickmodal'); } return; }
    if (t.hasAttribute('data-open-cmp')) { e.preventDefault(); if (location.hash !== '#compare') { if (!/^#\/p\/|^#cart/.test(location.hash)) lastListHash = location.hash || '#/'; location.hash = '#compare'; } else { renderCompare(); showModal('#cmpmodal'); } return; }
    if (t.hasAttribute('data-open-cart')) { e.preventDefault(); if (location.hash !== '#cart') { if (!/^#\/p\//.test(location.hash)) lastListHash = location.hash || '#/'; location.hash = '#cart'; } else { renderCart(); showModal('#cmodal'); } return; }
    if (t.hasAttribute('data-cstep')) { var cs = +t.getAttribute('data-cstep'), sec = $('#cartbody [data-csec="' + cs + '"]'), box = $('#cmodal .modal__box'); cstepSet(cs); if (sec && box) box.scrollTo({ top: Math.max(0, sec.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 12), behavior: 'smooth' }); return; }
    if (t.hasAttribute('data-cq')) { var i = +t.getAttribute('data-cq'); cart[i].qty = Math.max(1, cart[i].qty + +t.getAttribute('data-d')); saveCart(); updateBadges(); renderCart(); return; }
    if (t.hasAttribute('data-rm')) { cart.splice(+t.getAttribute('data-rm'), 1); saveCart(); updateBadges(); renderCart(); return; }
    if (t.hasAttribute('data-botcart')) {
      var bu = null;
      try { bu = siteOrderLink(); } catch (err) { bu = null; }
      if (!bu) { t.setAttribute('href', CONFIG.orderBot + '?start=' + botCartPayload()); track('бот/кошик', 'Бот для замовлень (кошик)'); markPending(); return; } // звичайне посилання
      e.preventDefault();
      var bw = window.open(bu, '_blank'); // синхронно в обробнику кліку — не блокується
      if (bw) { try { bw.opener = null; } catch (err) {} } else location.href = bu;
      t.setAttribute('href', bu);
      return;
    }
    if (t.hasAttribute('data-copy') || t.hasAttribute('data-send') || t.hasAttribute('data-wa') || t.hasAttribute('data-viber') || t.hasAttribute('data-ig')) markPending(); // спитаємо «Очистити кошик?», коли повернуться
    if (t.hasAttribute('data-copy')) { copyText(orderText()).then(function (ok) { toast(ok ? 'Текст замовлення скопійовано' : 'Не вдалося скопіювати — виділіть текст нижче'); if (!ok) $('.preview').open = true; }); return; }
    if (t.hasAttribute('data-send')) {
      var tgu = CONFIG.orderTelegram + '?text=' + encodeURIComponent(orderText());
      window.open(tgu, '_blank', 'noopener');
      return;
    }
    if (t.hasAttribute('data-wa')) { window.open(CONFIG.whatsapp + '?text=' + encodeURIComponent(orderText()), '_blank', 'noopener'); return; }
    if (t.hasAttribute('data-viber')) { location.href = CONFIG.viber + '&draft=' + encodeURIComponent(orderText()); return; }
    if (t.hasAttribute('data-ig')) {
      copyText(orderText()).then(function (ok) { toast(ok ? 'Instagram не підставляє текст сам — він уже скопійований, просто вставте в чат' : 'Відкрийте «Текст замовлення» і скопіюйте вручну'); if (!ok) $('.preview').open = true; });
      window.open(CONFIG.instagram, '_blank', 'noopener');
      return;
    }
    // 08.10.2026: старий обробник [data-share] (Telegram з текстом замовлення) прибрано — він спрацьовував і на кнопці «Поділитися» товару
    if (t.id === 'more') { renderMore(); return; }
    if (t.hasAttribute('data-brand')) {
      // brand logo cards: Meiji -> category, Palinal -> search across all Palinal categories
      e.preventDefault();
      var bq = t.getAttribute('data-brand-q') || '', bh = t.getAttribute('href') || '#/';
      $('#q').value = bq; state.q = bq;
      if ((location.hash || '#/') !== bh) history.pushState(null, '', bh);
      catScrollPending = true; route();
      return;
    }
    if (t.hasAttribute('data-go-chips')) { e.preventDefault(); var to = t.getAttribute('data-go-chips') || '#/'; var same = location.hash === to || (to === '#/' && location.hash === '');
      if (to === '#/') { // «Каталог» у нижньому меню → до списку розділів (чіпів)
        if (!same) { catScrollSkip = true; location.hash = to; }
        setTimeout(function () { var c = $('#chips'); if (c && c.getBoundingClientRect().height) window.scrollTo({ top: Math.max(0, Math.round(c.getBoundingClientRect().top + window.scrollY - stickyOffset() - 12)), behavior: reducedMotion() ? 'instant' : 'smooth' }); else scrollToResults(); }, 80);
      } else if (same) scrollToResults(); else { catScrollPending = true; location.hash = to; }
      return; }
    if (t.tagName === 'A' && !t.target && !t.hasAttribute('data-focus-search') && isCatHref(t.getAttribute('href') || '')) { // чіпи, бокове меню, банери, текстові посилання на розділи
      var ch = t.getAttribute('href'), cur = location.hash || '#/';
      if (ch === cur || (ch === '' && cur === '#/')) scrollToResults(); else catScrollPending = true;
    }
    if (t.hasAttribute('data-focus-search')) { e.preventDefault(); if (location.hash !== '#/' && !/^#\/c\//.test(location.hash)) location.hash = '#/'; window.scrollTo({ top: 0, behavior: 'smooth' }); setTimeout(function () { $('#q').focus(); }, 250); return; }
  });
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.id === 'q') { state.q = t.value.trim(); renderGridSearch(); return; }
    if (t.hasAttribute('data-f')) { var fk = t.getAttribute('data-f'); form[fk] = t.value; save('alexbes_form', form); var o = $('#otext'); if (o) o.textContent = orderText(); if (fk !== 'note') formChanged('input'); return; }
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
    if (lb.open) { // повноекранний перегляд фото
      if (e.key === 'Escape') { e.preventDefault(); lbClose(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); lbGo(e.key === 'ArrowLeft' ? -1 : 1, true); }
      else if (e.key === '+' || e.key === '=' || e.key === '-') { var r = lb.el.getBoundingClientRect(); lbZoomTo(lb.s * (e.key === '-' ? 1 / 1.5 : 1.5), r.left + r.width / 2, r.top + r.height / 2, false); }
      return;
    }
    if (e.key === 'Escape') { hideModal(); return; }
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && openModalEl && openModalEl === $('#pmodal') && !/INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || '')) { if (spin) { spinTouch(); spinShow(spin.cur + (e.key === 'ArrowLeft' ? -1 : 1)); spinAria(); } else galGo(e.key === 'ArrowLeft' ? -1 : 1, true); }
  });
  window.addEventListener('hashchange', route);

  /* ---------- Firebase bridge (js/fb.js is optional: if it never loads, everything above works from static data) ---------- */
  var BASE = {}; ALL_STATIC.forEach(function (p) { BASE[p.id] = p; });
  var STATIC_ORDER = ALL_STATIC.slice(); // разом із прихованими за замовчуванням (адмінка може їх показати)
  var STATIC_IDX = {}; STATIC_ORDER.forEach(function (p, i) { STATIC_IDX[p.id] = i; });
  var EDITABLE = ['name', 'category', 'price_eur', 'price_old_eur', 'price_label', 'in_stock', 'description', 'promo', 'variants', 'code', 'brand', 'gallery', 'videos'];
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
        var dn = discNorm(BASE[bp.id], d); // знижка з каталогу не губиться через старі правки ціни в адмінці
        EDITABLE.forEach(function (k) { if (dn[k] !== undefined) p[k] = dn[k]; });
        if (p.price_eur !== null && typeof p.price_eur !== 'number') p.price_eur = parseFloat(p.price_eur) || null;
        if (p.price_old_eur != null && typeof p.price_old_eur !== 'number') p.price_old_eur = parseFloat(p.price_old_eur) || null;
        if (p.variants && !(Array.isArray(p.variants) && p.variants.length)) p.variants = null;
        if (p.price_label === '') p.price_label = null;
        p.hasPhoto = !!d.hasPhoto;
      }
      if (d && d.hidden !== undefined ? d.hidden : p.hidden) return; // правка адмінки (true/false) важливіша за hidden із products.json
      delete p.hidden;
      if (CAT_ALIAS[p.category] && !catById[p.category]) { if (!p.sub) p.sub = p.category; p.category = CAT_ALIAS[p.category][0]; }
      if (!catById[p.category]) { if (BASE[p.id]) p.category = BASE[p.id].category; else return; }
      p.category_name = catName(p.category);
      out.push(p);
    });
    PRODUCTS = out; byId = {}; index = {};
    PRODUCTS.forEach(function (p) { byId[p.id] = p; indexProduct(p); });
    CATS.forEach(function (c) { c.count = PRODUCTS.filter(function (p) { return p.category === c.id; }).length; });
    splitCart(allLines()); saveCart(true); updateBadges();
    renderCats(); renderBanner();
    renderGrid(); cmpSync(); renderRecent();
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
  /* ---------- 03.10.2026: «Вибране», «Нещодавно переглянуті», «Поділитися», «Купити в один клік» ----------
     Усе локально (localStorage), без нових залежностей. Швидке замовлення йде тим самим шляхом, що й кошик:
     документ orders/<id> у Firestore (orderWriter із js/fb.js) → адмінка «Замовлення»; посилання o_<id> — у Telegram-бот.
     Маркер «Швидке замовлення» — на початку text і в note (окремого поля правила Firestore не дозволяють). */
  var SITE_URL = 'https://alexbes.com.ua/';
  var QUICK_MARK = 'Швидке замовлення';
  function svgI(d, sz) { return '<svg viewBox="0 0 24 24" width="' + (sz || 20) + '" height="' + (sz || 20) + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + d + '</svg>'; }
  var IC = {
    heart: '<path class="i-fill" d="M12 20.3s-7.4-4.5-9.1-9.3C1.7 7.5 4 4.5 7.4 4.5c1.9 0 3.5 1 4.6 2.7 1.1-1.7 2.7-2.7 4.6-2.7 3.4 0 5.7 3 4.5 6.5-1.7 4.8-9.1 9.3-9.1 9.3z"/>',
    share: '<path d="M12 3.5v11"/><path d="m7.8 7.7 4.2-4.2 4.2 4.2"/><path d="M5.5 12.5v5.8A2.2 2.2 0 0 0 7.7 20.5h8.6a2.2 2.2 0 0 0 2.2-2.2v-5.8"/>',
    bolt: '<path d="M13.2 2.8 5 13.4h6.2l-1.3 7.8 8.2-10.6h-6.2z"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="m8 12.3 2.7 2.7L16 9.6"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    tg: '<path d="M21.2 4.2 2.9 11.3c-.8.3-.8 1.4 0 1.7l4.6 1.6 1.8 5.5c.2.7 1.1.9 1.6.4l2.6-2.5 4.6 3.4c.6.4 1.4.1 1.6-.6l3-15.4c.2-.8-.6-1.5-1.3-1.2z"/><path d="m7.5 14.6 9.8-6.6-6.9 7.6"/>',
    chat: '<path d="M12 3.5c-4.8 0-8.5 3.2-8.5 7.6 0 2.5 1.2 4.6 3.2 6v3.4l3.2-1.9c.7.1 1.4.2 2.1.2 4.8 0 8.5-3.3 8.5-7.7S16.8 3.5 12 3.5z"/><path d="M9.2 8.6c.4 1.9 1.9 3.8 4.2 4.8"/>',
    link: '<path d="M10.3 13.7a4.2 4.2 0 0 0 5.9 0l2.9-2.9a4.2 4.2 0 0 0-5.9-5.9l-1.1 1.1"/><path d="M13.7 10.3a4.2 4.2 0 0 0-5.9 0l-2.9 2.9a4.2 4.2 0 0 0 5.9 5.9l1.1-1.1"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    phone: '<path d="M6.6 3.5h2.6l1.4 4.2-2 1.4a12.5 12.5 0 0 0 6.3 6.3l1.4-2 4.2 1.4v2.6a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z"/>'
  };

  /* --- Вибране --- */
  var favs = (function () { var a = load('alexbes_favs', []); return Array.isArray(a) ? a.filter(function (x) { return typeof x === 'string'; }).slice(0, 300) : []; })();
  function isFav(id) { return favs.indexOf(id) >= 0; }
  function favList() { return favs.filter(function (id) { return byId[id]; }); }
  function favBtnHTML(p, cls) {
    var on = isFav(p.id);
    return '<button class="favb ' + cls + (on ? ' is-on' : '') + '" type="button" data-fav="' + esc(p.id) + '" aria-pressed="' + on + '" aria-label="' + (on ? 'Прибрати з вибраного' : 'Додати у вибране') + ': ' + esc(p.name) + '" title="' + (on ? 'У вибраному' : 'У вибране') + '">' + svgI(IC.heart, cls === 'favb--pm' ? 19 : 18) + (cls === 'favb--pm' ? '<span>' + (on ? 'У вибраному' : 'У вибране') + '</span>' : '') + '</button>';
  }
  function toggleFav(id) {
    var p = byId[id]; if (!p) return;
    var on = !isFav(id);
    if (on) favs.unshift(id); else favs = favs.filter(function (x) { return x !== id; });
    save('alexbes_favs', favs);
    track('вибране/' + (on ? 'додано' : 'прибрано') + '/' + id, (on ? 'Вибране +: ' : 'Вибране −: ') + p.name);
    $$('[data-fav="' + id + '"]').forEach(function (b) {
      b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on);
      b.setAttribute('aria-label', (on ? 'Прибрати з вибраного' : 'Додати у вибране') + ': ' + p.name);
      b.title = on ? 'У вибраному' : 'У вибране';
      var s = b.querySelector('span'); if (s) s.textContent = on ? 'У вибраному' : 'У вибране';
    });
    toast(on ? 'Додано у вибране' : 'Прибрано з вибраного');
    renderCats(); markCats(); updateBadges();
    if (on) $$('.tab--fav .tab__ico').forEach(function (ic) { ic.classList.remove('bump'); void ic.offsetWidth; ic.classList.add('bump'); }); // «стрибок» сердечка в нижньому меню
    if (state.cat === 'fav' && !openModalEl) renderGrid();
  }
  function markCats() { $$('[data-cat]').forEach(function (a) { a.classList.toggle('on', a.getAttribute('data-cat') === state.cat); }); }

  /* --- Нещодавно переглянуті (до 8) --- */
  var RECENT_MAX = 8;
  var recent = (function () { var a = load('alexbes_recent', []); return Array.isArray(a) ? a.filter(function (x) { return typeof x === 'string'; }).slice(0, 16) : []; })();
  function pushRecent(id) {
    recent = [id].concat(recent.filter(function (x) { return x !== id; })).slice(0, 16); // запас на приховані товари
    save('alexbes_recent', recent);
    renderRecent();
  }
  function renderRecent() {
    var sec = $('#recent'), ul = $('#recent-list'); if (!sec || !ul) return;
    var list = recent.filter(function (id) { return byId[id]; }).slice(0, RECENT_MAX);
    sec.hidden = !list.length;
    ul.innerHTML = list.map(function (id) {
      var p = byId[id];
      return '<li class="rv__it"><button class="rv__card" type="button" data-open="' + esc(p.id) + '"><span class="rv__img"><img ' + mainImg(p, SZ_SM) + ' alt="" loading="lazy" decoding="async" width="160" height="160"></span>' +
        '<span class="rv__n">' + esc(p.name) + '</span><span class="rv__p">' + (hasPrice(p) ? uah(p.price_eur) + (oldOf(p) != null ? ' <s class="rv__old">' + uah(oldOf(p)) + '</s>' : '') : 'Ціну уточнюйте') + '</span></button></li>';
    }).join('');
    fillPhotos();
  }

  /* --- нижній аркуш (швидке замовлення, меню «Поділитися») --- */
  var sheetFocus = null, sheetKind = null;
  function sheetOpen(kind, html, label) {
    var sh = $('#sheet'); if (!sh) return;
    sheetFocus = document.activeElement; sheetKind = kind;
    $('#sheetbody').innerHTML = html;
    sh.querySelector('.sheet__box').setAttribute('aria-label', label || '');
    sh.setAttribute('data-kind', kind);
    sh.hidden = false;
    var f = sh.querySelector('[data-autofocus]') || sh.querySelector('.sheet__x');
    if (f) setTimeout(function () { try { f.focus({ preventScroll: true }); } catch (e) {} }, 30);
  }
  function sheetClose() {
    var sh = $('#sheet'); if (!sh || sh.hidden) return false;
    sh.hidden = true; sheetKind = null; $('#sheetbody').innerHTML = '';
    if (sheetFocus && sheetFocus.focus && sheetFocus.isConnected) { try { sheetFocus.focus({ preventScroll: true }); } catch (e) {} }
    return true;
  }

  /* --- Поділитися --- */
  // 08.10.2026 (Alex): ділимося лише назвою й посиланням — без ціни й тексту замовлення.
  // Товар -> статична сторінка p/<id>/ (og:image = перше фото, JPEG img/og/<id>.jpg; _work/gen_product_pages.py) — відкривається одразу на товарі.
  // Розділ -> c/<cat>/ (og-картка + перехід у #/c/<cat>[/<sub>]; _work/gen_cat_pages.py). Товари лише з адмінки / без сторінки -> #/p/<id>.
  function productUrl(p) { return BASE[p.id] && !/vens/i.test(p.id + ' ' + (BASE[p.id].name || '')) ? SITE_URL + 'p/' + encodeURIComponent(p.id) + '/' : SITE_URL + '#/p/' + encodeURIComponent(p.id); }
  function catShareUrl() {
    if (!catById[state.cat]) return SITE_URL + '#/c/' + state.cat; // «Акції», «Новинки», «Ексклюзив»
    var tail = [state.sub, state.cat === 'guns' ? state.brand : ''].filter(Boolean).join('/');
    return SITE_URL + 'c/' + encodeURIComponent(state.cat) + '/' + (tail ? '#' + tail : '');
  }
  function shareLink(title, url, key) {
    if (navigator.share) {
      navigator.share({ title: title, url: url }).then(function () { track('поділитися/системне/' + key, 'Поділитися (системне меню): ' + title); },
        function (e) { if (!e || e.name !== 'AbortError') shareMenu(title, url, key); });
      return;
    }
    shareMenu(title, url, key);
  }
  function shareProduct(id) { var p = byId[id]; if (p) shareLink(p.name, productUrl(p), p.id); }
  function shareCat() {
    if (state.cat === 'all' || state.cat === 'fav') return;
    var t = catLabel(state.cat);
    if (state.sub && subItem(state.cat, state.sub)) t += ' · ' + subName(state.cat, state.sub);
    if (state.cat === 'guns' && state.brand) t += ' · ' + brandName(state.brand);
    shareLink(t + ' — Alex_bes', catShareUrl(), 'c/' + state.cat);
  }
  function shareMenu(title, url, key) {
    track('поділитися/меню/' + key, 'Поділитися (меню): ' + title);
    sheetOpen('share',
      '<h3 class="sheet__ttl" id="sheet-ttl">Поділитися</h3><p class="sheet__sub">' + esc(title) + '</p>' +
      '<div class="shr">' +
        '<a class="shr__it" href="https://t.me/share/url?url=' + encodeURIComponent(url) + '" target="_blank" rel="noopener" data-shr="telegram" data-shr-id="' + esc(key) + '" data-autofocus>' + svgI(IC.tg, 22) + '<span>Telegram</span></a>' +
        '<a class="shr__it" href="viber://forward?text=' + encodeURIComponent(url) + '" data-shr="viber" data-shr-id="' + esc(key) + '">' + svgI(IC.chat, 22) + '<span>Viber</span></a>' +
        '<button class="shr__it" type="button" data-shr="copy" data-shr-id="' + esc(key) + '" data-url="' + esc(url) + '">' + svgI(IC.link, 22) + '<span>Копіювати посилання</span></button>' +
      '</div><p class="sheet__url">' + esc(url) + '</p>', 'Поділитися');
  }

  /* --- Купити в один клік --- */
  function normPhoneUA(s) { // 0XX XXX XX XX | +380… | 380… | 80… → "+380 XX XXX XX XX" або null
    var d = String(s || '').replace(/\D/g, '');
    if (d.length === 12 && d.slice(0, 3) === '380') d = '0' + d.slice(3);
    else if (d.length === 11 && d.slice(0, 2) === '80') d = d.slice(1);
    else if (d.length === 9) d = '0' + d;
    if (!/^0[3-9]\d{8}$/.test(d)) return null;
    return '+380 ' + d.slice(1, 3) + ' ' + d.slice(3, 6) + ' ' + d.slice(6, 8) + ' ' + d.slice(8);
  }
  var quick = null; // { id, vi, qty, busy }
  function quickLine(p, vi, qty) {
    var v = variantOf(p, vi), up = unitPrice(p, vi);
    return { name: p.name + (v ? ' (' + uahText(v.label).replace(/\u00a0/g, ' ') + ')' : ''), up: up, sum: up != null ? toUah(up) * qty : null };
  }
  function quickOpen(id) {
    var p = byId[id]; if (!p) return;
    var vi = pmState.id === id ? pmState.vi : 0, qty = pmState.id === id ? Math.max(1, Math.min(999, parseInt(($('#pmq') || {}).value, 10) || 1)) : 1;
    quick = { id: id, vi: vi, qty: qty, busy: false };
    var L = quickLine(p, vi, qty);
    track('швидке/відкрито/' + id, 'Купити в один клік (відкрито): ' + p.name);
    sheetOpen('quick',
      '<h3 class="sheet__ttl" id="sheet-ttl">' + svgI(IC.bolt, 20) + 'Купити в один клік</h3>' +
      '<div class="qk__item"><img ' + mainImg(p, SZ_SM) + ' alt="" width="64" height="64"><div><b>' + esc(L.name) + '</b><span>' + qty + ' шт' + (L.sum != null ? ' · ' + fmtUah(L.sum).replace(/ /g, '\u00a0') : ' · ціну уточнимо') + '</span></div></div>' +
      '<form class="qk__form" id="qkform" novalidate>' +
        '<label>Ім’я<input name="name" maxlength="100" autocomplete="name" required value="' + esc(form.name || '') + '" data-autofocus></label>' +
        '<label>Телефон<input name="phone" type="tel" inputmode="tel" maxlength="20" autocomplete="tel" required placeholder="0XX XXX XX XX" value="' + esc(form.phone || '') + '"></label>' +
        '<p class="qk__err" id="qkerr" role="alert" hidden></p>' +
        '<button class="btn btn--y btn--full qk__go" type="submit">Надіслати замовлення</button>' +
        '<p class="qk__note">Alex зателефонує або напише вам, щоб підтвердити ціну, наявність і деталі замовлення.</p>' +
      '</form>', 'Купити в один клік');
    fillPhotos();
  }
  function quickErr(msg, field) {
    var e = $('#qkerr'); if (e) { e.textContent = msg; e.hidden = !msg; }
    $$('#qkform input').forEach(function (i) { i.classList.toggle('is-bad', !!field && i.name === field); i.setAttribute('aria-invalid', !!field && i.name === field); });
    if (field) { var f = $('#qkform input[name="' + field + '"]'); if (f) f.focus(); }
  }
  function quickSubmit() {
    if (!quick || quick.busy) return;
    var p = byId[quick.id]; if (!p) return;
    var f = $('#qkform'), name = clipS(f.elements.name.value, 100), phone = normPhoneUA(f.elements.phone.value);
    if (name.length < 2) return quickErr('Вкажіть, будь ласка, ім’я.', 'name');
    if (!phone) return quickErr('Перевірте номер телефону: формат 0XX XXX XX XX або +380 XX XXX XX XX.', 'phone');
    quickErr('');
    form.name = name; form.phone = phone; save('alexbes_form', form);
    var L = quickLine(p, quick.vi, quick.qty), v = variantOf(p, quick.vi);
    var it = { id: clipS(p.id, 80), name: clipS(p.name, 300), qty: quick.qty, price_uah: L.up != null ? toUah(L.up) : null };
    if (v) it.variant = clipS(uahText(v.label).replace(/\u00a0/g, ' '), 200);
    var text = [QUICK_MARK + ' (в один клік) з сайту ' + CONFIG.siteName, '',
      '1. ' + L.name + ' — ' + quick.qty + ' шт' + (L.up != null ? ' × ' + uahTxt(L.up) + ' = ' + fmtUah(L.sum) : ' — ціну уточнити'),
      '', "Ім'я: " + name, 'Телефон: ' + phone, '', 'Передзвоніть, будь ласка, для підтвердження.'].join('\n');
    var data = { v: 1, items: JSON.stringify([it]), count: 1, total_uah: L.sum != null ? Math.min(1e9, L.sum) : 0, ask: L.up != null ? 0 : 1,
      text: clipS(text, 6000), name: name, phone: phone, note: QUICK_MARK + ' (в один клік)' };
    var id = genOrderId(), btn = $('#qkform .qk__go');
    quick.busy = true; if (btn) { btn.disabled = true; btn.textContent = 'Надсилаємо…'; }
    var done = false, q = quick;
    function fail(why) {
      if (done) return; done = true; q.busy = false;
      track('швидке/помилка/' + p.id, 'Купити в один клік (не надіслано: ' + why + '): ' + p.name);
      if (sheetKind !== 'quick' || quick !== q) return;
      $('#sheetbody').innerHTML = '<div class="qk__done qk__done--err"><h3 class="sheet__ttl" id="sheet-ttl">Не вдалося надіслати автоматично</h3>' +
        '<p>Схоже, з’єднання недоступне. Замовте цей товар через бота або зателефонуйте — це займе хвилину.</p>' +
        '<a class="btn btn--bot btn--full" href="' + CONFIG.orderBot + '?start=' + encodeURIComponent(p.id) + '" target="_blank" rel="noopener" data-order="' + esc(p.id) + '">' + svgI(IC.tg, 18) + 'Замовити через бота</a>' +
        '<a class="btn btn--o btn--full" href="tel:' + CONFIG.phone + '">' + svgI(IC.phone, 18) + 'Подзвонити ' + CONFIG.phoneLabel + '</a></div>';
    }
    var w = null;
    try { w = orderWriter ? orderWriter(id, data) : null; } catch (e) { w = null; }
    if (!w || typeof w.then !== 'function') return fail('немає з’єднання з базою');
    var to = setTimeout(function () { fail('тайм-аут'); }, 12000);
    w.then(function () {
      clearTimeout(to); if (done) return; done = true; q.busy = false;
      track('швидке/надіслано/' + p.id, 'Купити в один клік (надіслано): ' + p.name);
      formChanged('order');
      if (sheetKind !== 'quick' || quick !== q) return;
      $('#sheetbody').innerHTML = '<div class="qk__done"><span class="qk__ok">' + svgI(IC.check, 44) + '</span>' +
        '<h3 class="sheet__ttl" id="sheet-ttl">Дякуємо! Замовлення прийнято</h3>' +
        '<p>' + esc(L.name) + ' — ' + q.qty + ' шт.</p>' +
        '<p>Alex зв’яжеться з вами за номером <b>' + esc(phone) + '</b>, щоб підтвердити ціну, наявність і деталі.</p>' +
        '<p class="qk__no">Номер замовлення: <b>' + esc(id.slice(0, 6).toUpperCase()) + '</b></p>' +
        '<a class="btn btn--o btn--full" href="' + CONFIG.orderBot + '?start=o_' + id + '" target="_blank" rel="noopener" data-quickbot>' + svgI(IC.tg, 18) + 'Надіслати також у Telegram-бот</a>' +
        '<button class="btn btn--y btn--full" type="button" data-sheet-close>Готово</button></div>';
      var ok = $('#sheetbody .btn--y'); if (ok) ok.focus({ preventScroll: true });
    }, function (e) { clearTimeout(to); try { console.warn('quick order not saved', e && e.code); } catch (x) {} fail(e && e.code ? e.code : 'помилка запису'); });
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-sheet-close], [data-fav], [data-share], [data-share-cat], [data-quick], [data-shr], [data-recent-clear]') : null;
    if (!t) return;
    if (t.hasAttribute('data-sheet-close')) { e.preventDefault(); sheetClose(); return; }
    if (t.hasAttribute('data-fav')) { e.preventDefault(); e.stopPropagation(); toggleFav(t.getAttribute('data-fav')); return; }
    if (t.hasAttribute('data-share')) { e.preventDefault(); e.stopPropagation(); shareProduct(t.getAttribute('data-share')); return; }
    if (t.hasAttribute('data-share-cat')) { e.preventDefault(); e.stopPropagation(); shareCat(); return; }
    if (t.hasAttribute('data-quick')) { e.preventDefault(); quickOpen(t.getAttribute('data-quick')); return; }
    if (t.hasAttribute('data-recent-clear')) { e.preventDefault(); recent = []; save('alexbes_recent', recent); renderRecent(); return; }
    if (t.hasAttribute('data-shr')) {
      var ch = t.getAttribute('data-shr'), sid = t.getAttribute('data-shr-id'), sp = byId[sid] || { name: sid };
      track('поділитися/' + ch + '/' + sid, 'Поділитися (' + ch + '): ' + (sp ? sp.name : sid));
      if (ch === 'copy') { e.preventDefault(); copyText(t.getAttribute('data-url')).then(function (ok) { toast(ok ? 'Посилання скопійовано' : 'Не вдалося скопіювати'); if (ok) sheetClose(); }); }
      else setTimeout(sheetClose, 300);
    }
  }, true);
  document.addEventListener('submit', function (e) { if (e.target && e.target.id === 'qkform') { e.preventDefault(); quickSubmit(); } });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && $('#sheet') && !$('#sheet').hidden) { e.preventDefault(); e.stopImmediatePropagation(); sheetClose(); } }, true);

  window.AlexBes = {
    applyRemote: applyRemote,
    setPhotoLoader: function (fn) { photoLoader = fn; fillPhotos(); },
    getCart: allLines,
    setCart: function (lines) { splitCart(lines); saveCart(true); updateBadges(); if (openModalEl && openModalEl === $('#cmodal')) renderCart(); },
    onCartChange: function (fn) { cartListeners.push(fn); },
    getForm: function () { return Object.assign({}, form); },
    setOrderWriter: function (fn) { orderWriter = typeof fn === 'function' ? fn : null; },
    setCartEventWriter: function (fn) { cartEvWriter = typeof fn === 'function' ? fn : null; if (cartEvWriter) { var q = cartEvQ; cartEvQ = []; q.forEach(cartEvSend); } },
    setStatWriter: function (fn) { statWriter = typeof fn === 'function' ? fn : null; if (statWriter) { var q = statQ; statQ = []; q.forEach(function (x) { statSend(x[0], x[1]); }); } },
    onFormChange: function (fn) { formListener = typeof fn === 'function' ? fn : null; },
    // профіль змінено явно (сторінка профілю / інший пристрій) → перезаписати поля кошика переданими значеннями
    setForm: function (f) { var ch = false; ['name', 'phone', 'city'].forEach(function (k) { if (typeof f[k] === 'string' && f[k] !== (form[k] || '')) { form[k] = f[k]; ch = true; } }); if (ch) { save('alexbes_form', form); if (openModalEl && openModalEl === $('#cmodal')) renderCart(); } },
    fillForm: function (f) { var ch = false; ['name', 'phone', 'city'].forEach(function (k) { if (f[k] && !form[k]) { form[k] = f[k]; ch = true; } }); if (ch) { save('alexbes_form', form); if (openModalEl && openModalEl === $('#cmodal')) renderCart(); } },
    showModal: function (sel) { showModal(sel); },
    hideModal: hideModal,
    toast: function (m) { toast(m); },
    track: track,
    gunSpecs: function (id) { return byId[id] ? gunSpecs(byId[id]) : null; },
    related: function (id) { var p = byId[id]; return p ? { rule: relRuleOf(p), ids: relatedOf(p).map(function (x) { return x.id; }) } : null; } // перевірка RELATED_RULES з консолі
  };
  // last known Firestore overrides (no photos) — applied instantly so hidden/edited items don't flash; refreshed by js/fb.js
  try { var cachedRemote = load('alexbes_remote', null); if (cachedRemote && Array.isArray(cachedRemote.docs)) applyRemote(cachedRemote.docs); } catch (e) {}

  /* ---------- головний банер-карусель (02.10.2026): 🔧 кузовні роботи (статичний слайд з index.html) + 🔥 Акції + ✅ Новинки ----------
     Слайди акцій/новинок будуються лише з реальних товарів з позначкою «Акція» / «Новинка»; немає таких — слайду немає.
     Свайп — нативний scroll-snap; автопрокрутка ~5 с, пауза при дотику/наведенні/фокусі, поза екраном і у фоновій вкладці;
     prefers-reduced-motion — без автопрокрутки й анімації (лише свайп і крапки). */
  function plural(n, a, b, c) { var m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? b : c; }
  /* 08.10.2026 (Alex): на головній лише банер кузовних робіт (статичний слайд у index.html).
     Автослайди «Акції»/«Новинки» з товарів з позначкою промо в адмінці вимкнено — позначки на картках і вкладка «Акції» лишаються.
     Повернути їх: BNR_PROMO = true. Один слайд -> крапок немає (dots.hidden), автопрокрутки немає (bnrPlan: < 2 слайдів). */
  var BNR_PROMO = false;
  var bnr = { el: $('#bnr'), track: $('#bnr-track'), dots: $('#bnr-dots'), i: 0, timer: null, hold: false, holdT: null, vis: true,
    rm: window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false } };
  function bnrPromoSlide(kind, list) {
    var sale = kind === 'sale', n = list.length, href = '#/c/' + kind;
    var ttl = sale ? 'Акції' : 'Новинки';
    var sub = n + ' ' + plural(n, 'товар', 'товари', 'товарів') + ' з позначкою «' + (sale ? 'Акція' : 'Новинка') + '»';
    var items = list.slice(0, 3).map(function (p) {
      return '<span class="bnr__it"><img ' + mainImg(p, SZ_SM) + ' alt="" loading="lazy" decoding="async" width="200" height="200"><span class="bnr__nm">' + esc(p.name) + '</span></span>';
    }).join('');
    return '<div class="bnr__slide bnr__slide--' + kind + '" data-slide="' + kind + '" role="group" aria-roledescription="слайд" aria-label="' + ttl + '">' +
      '<a class="hero__frame bnr__promo" href="' + href + '" data-go-chips="' + href + '">' +
        '<span class="bnr__head"><b class="bnr__ttl">' + (sale ? '<svg class="ico" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>' : '<svg class="ico" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M21.8 10A10 10 0 1 1 17 3.34"/><path d="m9 11 3 3L22 4"/></svg>') + ' ' + ttl + '</b><span class="bnr__sub">' + esc(sub) + '</span></span>' +
        '<span class="bnr__items bnr__items--' + Math.min(n, 3) + '">' + items + '</span>' +
      '</a>' +
      '<a class="btn btn--y hero__btn" href="' + href + '" data-go-chips="' + href + '">' + (sale ? 'Дивитись усі акції' : 'Дивитись усі новинки') + ' (' + n + ') →</a>' +
    '</div>';
  }
  function renderTrust() { var n = PRODUCTS.length; $$('[data-prod-count]').forEach(function (b) { b.textContent = n + ' ' + plural(n, 'товар', 'товари', 'товарів'); }); }
  function renderBanner() {
    renderTrust();
    if (!bnr || !bnr.track) return; // applyRemote() from cache runs before this block is initialised; init calls renderBanner() again
    $$('.bnr__slide[data-slide="sale"], .bnr__slide[data-slide="new"]', bnr.track).forEach(function (s) { s.remove(); });
    var sale = PRODUCTS.filter(isSale), nw = PRODUCTS.filter(isNew);
    var html = BNR_PROMO ? (sale.length ? bnrPromoSlide('sale', sale) : '') + (nw.length ? bnrPromoSlide('new', nw) : '') : '';
    if (html) bnr.track.insertAdjacentHTML('beforeend', html);
    var n = bnrSlides().length;
    bnr.dots.innerHTML = n > 1 ? bnrSlides().map(function (s, i) { return '<button class="bnr__dot" type="button" data-bnr-dot="' + i + '" aria-label="Слайд ' + (i + 1) + ': ' + esc(s.getAttribute('aria-label')) + '"></button>'; }).join('') : '';
    bnr.dots.hidden = n < 2;
    if (bnr.i >= n) bnr.i = 0;
    bnrGo(bnr.i, true); fillPhotos(); bnrPlan(); bnrAnimWatch();
  }
  function bnrSlides() { return $$('.bnr__slide', bnr.track); }
  /* анімація слайдів (03.10.2026): слайд, що увійшов у кадр на ≥60%, отримує .is-on (CSS запускає появу тексту, Ken Burns, відблиск);
     коли слайд повністю пішов з кадру — .is-on знімається, тож при наступній появі анімація стартує заново.
     Лише CSS transform/opacity; prefers-reduced-motion або без IntersectionObserver — клас .bnr--anim не ставиться, усе статичне й видиме. */
  var bnrIO = null;
  function bnrAnimWatch() {
    if (!bnr.track) return;
    if (bnr.rm.matches || !('IntersectionObserver' in window)) { bnr.el.classList.remove('bnr--anim'); return; }
    bnr.el.classList.add('bnr--anim');
    if (!bnrIO) bnrIO = new IntersectionObserver(function (en) {
      en.forEach(function (e) {
        var s = e.target;
        if (e.intersectionRatio >= 0.6) s.classList.add('is-on');
        else if (!e.isIntersecting || e.intersectionRatio === 0) s.classList.remove('is-on');
      });
    }, { root: bnr.track, threshold: [0, 0.6] });
    var cur = bnrSlides()[bnr.i]; if (cur) cur.classList.add('is-on'); // поточний слайд — одразу, без миготіння до першого колбеку IO
    bnrSlides().forEach(function (s) { if (!s.bnrAnim) { s.bnrAnim = 1; bnrIO.observe(s); } });
  }
  function bnrGo(i, instant) {
    var sl = bnrSlides(), n = sl.length; if (!n) return;
    bnr.i = (i + n) % n;
    bnr.track.scrollTo({ left: bnr.i * bnr.track.clientWidth, behavior: instant || bnr.rm.matches ? 'auto' : 'smooth' });
    bnrDots();
  }
  function bnrDots() { $$('.bnr__dot', bnr.dots).forEach(function (d, k) { d.classList.toggle('on', k === bnr.i); d.setAttribute('aria-current', k === bnr.i ? 'true' : 'false'); }); }
  function bnrPlan() {
    clearTimeout(bnr.timer); bnr.timer = null;
    if (bnr.rm.matches || bnr.hold || !bnr.vis || document.hidden || bnrSlides().length < 2) return;
    bnr.timer = setTimeout(function () { bnrGo(bnr.i + 1); bnrPlan(); }, 5000);
  }
  function bnrHold(on, resumeMs) {
    clearTimeout(bnr.holdT);
    if (on) { bnr.hold = true; bnrPlan(); return; }
    bnr.holdT = setTimeout(function () { bnr.hold = false; bnrPlan(); }, resumeMs || 0);
  }
  if (bnr.track) {
    var bnrRaf = 0;
    bnr.track.addEventListener('scroll', function () { // swipe -> current dot
      if (bnrRaf) return;
      bnrRaf = requestAnimationFrame(function () { bnrRaf = 0; var w = bnr.track.clientWidth || 1, k = Math.round(bnr.track.scrollLeft / w); if (k !== bnr.i) { bnr.i = k; bnrDots(); bnrPlan(); } });
    }, { passive: true });
    bnr.track.addEventListener('touchstart', function () { bnrHold(true); }, { passive: true });
    bnr.track.addEventListener('touchend', function () { bnrHold(false, 7000); }, { passive: true });
    bnr.track.addEventListener('touchcancel', function () { bnrHold(false, 7000); }, { passive: true });
    bnr.el.addEventListener('mouseenter', function () { bnrHold(true); });
    bnr.el.addEventListener('mouseleave', function () { bnrHold(false, 1500); });
    bnr.el.addEventListener('focusin', function () { bnrHold(true); });
    bnr.el.addEventListener('focusout', function () { bnrHold(false, 3000); });
    bnr.dots.addEventListener('click', function (e) { var d = e.target.closest('[data-bnr-dot]'); if (d) { bnrGo(+d.getAttribute('data-bnr-dot')); bnrPlan(); } });
    document.addEventListener('visibilitychange', bnrPlan);
    // 3D-нахил банера за мишею (лише десктоп з точним вказівником, без prefers-reduced-motion): --mx/--my від -1 до 1 на .hero__frame
    if (window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches) {
      var tiltF = null, tiltE = null, tiltRaf = 0;
      bnr.el.addEventListener('pointermove', function (e) {
        if (bnr.rm.matches || e.pointerType !== 'mouse') return;
        tiltE = e; if (tiltRaf) return;
        tiltRaf = requestAnimationFrame(function () {
          tiltRaf = 0; var f = tiltE.target.closest && tiltE.target.closest('.hero__frame');
          if (tiltF && tiltF !== f) { tiltF.style.removeProperty('--mx'); tiltF.style.removeProperty('--my'); }
          tiltF = f; if (!f) return;
          var r = f.getBoundingClientRect(), x = (tiltE.clientX - r.left) / r.width * 2 - 1, y = (tiltE.clientY - r.top) / r.height * 2 - 1;
          f.style.setProperty('--mx', Math.max(-1, Math.min(1, x)).toFixed(3)); f.style.setProperty('--my', Math.max(-1, Math.min(1, y)).toFixed(3));
        });
      });
      bnr.el.addEventListener('mouseleave', function () { if (tiltF) { tiltF.style.removeProperty('--mx'); tiltF.style.removeProperty('--my'); tiltF = null; } });
    }
    if (bnr.rm.addEventListener) bnr.rm.addEventListener('change', function () { bnrPlan(); bnrAnimWatch(); });
    window.addEventListener('resize', function () { bnrGo(bnr.i, true); });
    if ('IntersectionObserver' in window) new IntersectionObserver(function (en) { bnr.vis = en[0].isIntersecting; bnrPlan(); }, { threshold: 0.25 }).observe(bnr.el);
  }

  /* ---------- 04.10.2026: «Підібрати фарбу за кодом» (#code) ----------
     Шукає лише серед товарів каталогу (готові кольори PALINAL: emal2k, baza + усе з RAL у назві) за кодом у назві / полі code.
     Нічого не обіцяємо понад каталог: якщо готового кольору немає — чесно пишемо це і пропонуємо уточнити в Telegram.
     «Де знайти код фарби» — загальнодоступні довідки виробників фарб/дилерів (перевірено 04.10.2026):
     bumpersthatdeliver.com/locate-your-paint-code, paintscratch.com/touch-up-paint-codes/paint-code, chipex.co.uk (how-to-find-your-car-paint-code),
     paintnuts.co.uk/pages/find-your-code, centralalbertapaintsupply.ca, fastcarcheck.uk (Renault), car-editor.com (BMW). */
  var CS_MAKES = [
    { k: 'vw', re: /^(vw|volks|фольк|audi|ауд|skoda|škoda|шкод|seat|сеат|cupra|купра)/i, tok: ['VW', 'SKODA', 'AUDI', 'SEAT'], t: 'Volkswagen, Audi, Škoda, Seat' },
    { k: 'toyota', re: /^(toyota|тойот|lexus|лексус)/i, tok: ['TOY', 'TOYOTA', 'LEXUS'], t: 'Toyota, Lexus' },
    { k: 'bmw', re: /^(bmw|бмв|mini|міні)/i, tok: ['BMW'], t: 'BMW, MINI' },
    { k: 'merc', re: /^(merc|мерс|мерседес|benz|бенц|mb$|smart|смарт)/i, tok: ['MERC', 'MERCEDES', 'DB'], t: 'Mercedes-Benz' },
    { k: 'ford', re: /^(ford|форд)/i, tok: ['FORD'], t: 'Ford' },
    { k: 'ren', re: /^(renault|рено|dacia|дачія|дачия)/i, tok: ['REN', 'RENAULT', 'DACIA'], t: 'Renault, Dacia' },
    { k: 'psa', re: /^(peugeot|пежо|citro|сітро|ситро|ds$)/i, tok: ['CITR', 'CITROEN', 'PEUG', 'PEUGEOT'], t: 'Peugeot, Citroën' },
    { k: 'opel', re: /^(opel|опель|vauxhall)/i, tok: ['OPEL'], t: 'Opel' },
    { k: 'hk', re: /^(hyundai|хюнд|хенд|хунд|kia|кіа|киа)/i, tok: ['HYUNDAI', 'KIA'], t: 'Hyundai, Kia' },
    { k: 'honda', re: /^(honda|хонда|acura|акура)/i, tok: ['HONDA'], t: 'Honda, Acura' },
    { k: 'nissan', re: /^(nissan|ніссан|нисан|нісан|infiniti|інфініті)/i, tok: ['NISSAN', 'NISS'], t: 'Nissan, Infiniti' },
    { k: 'gm', re: /^(chevr|шевр|gm$|cadillac|buick|gmc)/i, tok: ['CHEVROLET', 'GM'], t: 'Chevrolet / GM' },
    { k: 'volvo', re: /^(volvo|вольво)/i, tok: ['VOLVO'], t: 'Volvo' },
    { k: 'fiat', re: /^(fiat|фіат|фиат)/i, tok: ['FIAT'], t: 'Fiat' },
    { k: 'lada', re: /^(lada|лада|ваз)/i, tok: ['LADA'], t: 'Lada' },
    { k: 'daf', re: /^daf/i, tok: ['DAF'], t: 'DAF' }
  ];
  // м — місце (1 стійка дверей, 2 під капотом, 3 багажник, 4 бардачок), w — де шукати, ex — приклади формату коду
  var CS_WHERE = [
    { k: 'vw', m: [3], w: 'Наклейка в багажнику — у ніші запасного колеса, під килимком або на кришці багажника; дублюється в сервісній книжці. На наклейці VW код часто з літерою L попереду (LA7W), у каталогах фарб — без неї (A7W).', ex: 'LY9B, LA7W, 2T' },
    { k: 'toyota', m: [1], w: 'Наклейка на стійці дверей водія. Код — після «C/TR»: у записі C/TR 040/FB13 код фарби — 040, а FB13 — код салону.', ex: '040, 202, 1C0, 1D6' },
    { k: 'bmw', m: [1, 2], w: 'Новіші моделі — наклейка на стійці дверей водія; старіші — під капотом, на опорі амортизатора з боку водія.', ex: '475, 300, A96' },
    { k: 'merc', m: [1, 2], w: 'Стійка дверей водія, верхня поперечина радіатора під капотом або внутрішній бік капота. Старі коди — з префіксом DB.', ex: '040, 197, 775, 149' },
    { k: 'ford', m: [1], w: 'Табличка або наклейка на стійці дверей водія; код — у полі PAINT або EXT PNT.', ex: 'J7, D3, ZY' },
    { k: 'ren', m: [1, 2, 3], w: 'Стійка дверей водія або табличка під капотом; на деяких моделях — у багажнику.', ex: 'TEGNE, OV369, KNG' },
    { k: 'psa', m: [1], w: 'Стійка дверей водія або зона дверної завіси.', ex: 'EWP, KTV, M0YG' },
    { k: 'opel', m: [1], w: 'Стійка дверей водія — поле PNT або Body Colour.', ex: '' },
    { k: 'hk', m: [1, 2], w: 'Наклейка на стійці дверей водія (поле PAINT); зрідка — на моторному щиті під капотом.', ex: 'SWP, ABT, UD' },
    { k: 'honda', m: [1], w: 'Наклейка на стійці дверей водія.', ex: 'NH731P, NH578, B92P' },
    { k: 'nissan', m: [1, 2], w: 'Стійка дверей водія або під капотом — на моторному щиті чи на панелі радіатора.', ex: 'KH3, KAD, G41' },
    { k: 'gm', m: [1, 4, 3], w: 'Стійка дверей водія, наклейка Service Parts Identification у бардачку або в ніші запасного колеса. Код — поруч із BC/CC або з префіксом WA чи U: WA926L, U926L і 926L — той самий колір.', ex: 'WA926L, 926L' },
    { k: 'volvo', m: [1, 2], w: 'Наклейка на стійці між передніми й задніми дверима (знизу); на старших моделях — під капотом. Потрібні перші 3 цифри: з «446-46» — 446.', ex: '446' }
  ];
  var CS_SPOTS = ['Стійка дверей водія', 'Під капотом', 'Багажник, ніша запаски', 'Бардачок'];
  var CS_LAT = { 'А': 'A', 'В': 'B', 'С': 'C', 'Е': 'E', 'Н': 'H', 'І': 'I', 'К': 'K', 'М': 'M', 'О': 'O', 'Р': 'P', 'Т': 'T', 'Х': 'X', 'У': 'Y' };
  var CS_STOP = { MET: 1, RAL: 1, TOY: 1, REN: 1, BMW: 1, DAF: 1, ALU: 1, VAN: 1 };
  var cs = { code: '', make: '', where: false };
  function csUp(s) { return String(s || '').toUpperCase().replace(/[АВСЕНІКМОРТХУ]/g, function (c) { return CS_LAT[c]; }); }
  function csMake(s) { s = String(s || '').trim(); if (!s) return null; for (var i = 0; i < CS_MAKES.length; i++) if (CS_MAKES[i].re.test(s)) return CS_MAKES[i]; return null; }
  function csIc(d, sz) { return svgI(d, sz || 20); }
  var CS_IC = {
    can: '<path d="M7 6.5h10v12.5a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z"/><path d="M8.5 6.5V4.5h7v2"/><path d="M7 11h10"/><circle cx="12" cy="15.5" r="1.6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.8-3.8"/>',
    pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r=".7" fill="currentColor"/>'
  };
  function csTokens(p) { // токени коду з назви: 'MERC 744/Y BRILLANTSILBER' -> 744, Y? (ні), ...
    var nm = csUp(String(p.name || '').replace(/^Palinal\s+(2K\s+автоемаль|базова\s+фарба)\s+/i, ''));
    var all = nm.split(/[^A-Z0-9]+/).filter(Boolean), makes = [], toks = [];
    all.forEach(function (t) {
      CS_MAKES.forEach(function (m) { if (m.tok.indexOf(t) >= 0 && makes.indexOf(m.k) < 0) makes.push(m.k); });
      if (t === 'RAL' && makes.indexOf('ral') < 0) makes.push('ral');
      if ((t.length >= 2 && t.length <= 7 && /\d/.test(t)) || (t.length === 3 && /^[A-Z]+$/.test(t) && !CS_STOP[t] && !CS_MAKES.some(function (m) { return m.tok.indexOf(t) >= 0; }))) toks.push(t);
    });
    return { nm: nm, makes: makes, toks: toks };
  }
  function csPool() { return PRODUCTS.filter(function (p) { return p.sub === 'emal2k' || p.sub === 'baza' || /\bRAL\b/i.test(p.name || ''); }); }
  function csSearch(code, makeStr) {
    var q = csUp(code).replace(/\s+/g, ' ').trim(), mk = csMake(makeStr), out = [];
    if (q.length < 2) return { q: q, mk: mk, list: [] };
    var ral = q.match(/^RAL\s*-?\s*(\d{4})$/) || (/^\d{4}$/.test(q) ? [q, q] : null);
    var whole = q.replace(/[^A-Z0-9]/g, ''), first = q.split('/')[0].replace(/[^A-Z0-9]/g, '');
    var qs = [whole]; if (first && first !== whole) qs.push(first);
    csPool().forEach(function (p) {
      var t = csTokens(p), how = '';
      if (ral && t.makes.indexOf('ral') >= 0 && t.toks.indexOf(ral[1]) >= 0) how = 'ral';
      else if (!/^RAL/.test(q)) {
        qs.forEach(function (c) {
          if (how || c.length < 2) return;
          if (t.toks.indexOf(c) >= 0) how = 'code';
          else if (/^\d{3,4}$/.test(c) && t.toks.some(function (x) { return /^\d+$/.test(x) && x.length >= 3 && +x === +c; })) how = 'code';
          else if (/^L[A-Z0-9]{3}$/.test(c) && t.makes.indexOf('vw') >= 0 && t.toks.indexOf(c.slice(1)) >= 0) how = 'vwl';
          else if (p.code && csUp(p.code).replace(/[^A-Z0-9]/g, '') === c && c.length >= 5) how = 'sku';
        });
        if (!how && /^[A-Z]{4,}$/.test(whole) && t.nm.replace(/[^A-Z]/g, '').indexOf(whole) >= 0) how = 'name';
      }
      if (!how) return;
      var rel = !mk ? 'any' : (t.makes.indexOf(mk.k) >= 0 ? 'same' : (t.makes.filter(function (m) { return m !== 'ral'; }).length ? 'other' : 'any'));
      out.push({ p: p, how: how, rel: rel, makes: t.makes });
    });
    var rank = { same: 0, any: 1, other: 2 };
    out.sort(function (a, b) { return rank[a.rel] - rank[b.rel] || (/^в наявності/i.test(a.p.in_stock || '') ? 0 : 1) - (/^в наявності/i.test(b.p.in_stock || '') ? 0 : 1); });
    return { q: q, mk: mk, list: out.slice(0, 12) };
  }
  function csTgHref(code, make) {
    return CONFIG.orderTelegram + '?text=' + encodeURIComponent('Вітаю! Потрібна фарба за кодом.\nМарка авто: ' + (make || 'не вказано') + '\nКод фарби: ' + (code || '—') + '\nПідкажіть, будь ласка, наявність і підбір кольору.');
  }
  var CS_HOW = { ral: 'Збіг за RAL', code: 'Збіг за кодом', vwl: 'Код VW без L', sku: 'Збіг за артикулом', name: 'Збіг за назвою' };
  function csCard(r) {
    var p = r.p;
    return '<li class="cs__card' + (r.rel === 'other' ? ' cs__card--other' : '') + '">' +
      '<button class="pk__img" type="button" data-open="' + esc(p.id) + '" aria-label="' + esc(p.name) + '"><img ' + mainImg(p, SZ_SM) + ' alt="" width="200" height="200" loading="lazy" decoding="async"></button>' +
      '<div class="pk__cb"><span class="cs__how">' + esc(CS_HOW[r.how]) + '</span><button class="pk__name" type="button" data-open="' + esc(p.id) + '">' + esc(p.name) + '</button>' +
      '<div class="pk__price">' + pillHTML(p) + (p.price_label ? ' <small class="muted">' + esc(uahText(p.price_label)) + '</small>' : '') + '</div>' + stockHTML(p) + '</div>' +
      '<button class="cs__add" type="button" data-add="' + esc(p.id) + '" aria-label="Додати «' + esc(p.name) + '» в кошик">' + csIc('<path d="M12 5v14M5 12h14"/>', 18) + '</button></li>';
  }
  function csWhereHTML(mk) {
    var car = '<svg class="cs__car" viewBox="0 0 320 112" role="img" aria-label="Де зазвичай розташована табличка з кодом фарби" focusable="false">' +
      '<path class="cs__body" d="M18 80l7-17c3-6 8-8 16-8.5l50-3.5 28-20c5-4 10-5 19-5h64c10 0 16 2 23 8l27 20 38 5c11 1.6 14 7 14 17v8c0 3-2 5-5 5h-18a22 22 0 0 0-44 0H104a22 22 0 0 0-44 0H24c-4 0-6-3-6-7z"/>' +
      '<path class="cs__glass" d="M126 33l-14 18h56V31h-32c-4 0-7 .7-10 2zM176 31v20h62l-18-15c-4-3-8-5-14-5z"/>' +
      '<path class="cs__line" d="M172 52v34M60 56c8 0 14 2 18 8M270 58v28"/>' +
      '<circle class="cs__wh" cx="82" cy="88" r="16"/><circle class="cs__wh" cx="258" cy="88" r="16"/>' +
      [[176, 66, 1], [52, 64, 2], [286, 68, 3], [122, 50, 4]].map(function (s) {
        var on = mk && mk.m.indexOf(s[2]) >= 0;
        return '<g class="cs__spot' + (on ? ' on' : '') + '"><circle cx="' + s[0] + '" cy="' + s[1] + '" r="10"/><text x="' + s[0] + '" y="' + (s[1] + 4.2) + '" text-anchor="middle">' + s[2] + '</text></g>';
      }).join('') + '</svg>';
    var rows = CS_WHERE.slice().sort(function (a, b) { return (mk && a.k === mk.k ? -1 : 0) - (mk && b.k === mk.k ? -1 : 0); });
    return car + '<ol class="cs__spots">' + CS_SPOTS.map(function (s, i) { return '<li' + (mk && mk.m.indexOf(i + 1) >= 0 ? ' class="on"' : '') + '><b>' + (i + 1) + '</b>' + s + '</li>'; }).join('') + '</ol>' +
      '<p class="cs__tip">' + csIc(CS_IC.info, 16) + '<span>Найчастіше код — на наклейці в отворі дверей водія. Шукайте поля <b>PAINT</b>, <b>COLOR</b>, <b>C/TR</b>, <b>LACK</b> або <b>FARBE</b>. Таблички немає — код за VIN підкаже дилер марки.</span></p>' +
      '<ul class="cs__mk">' + rows.map(function (w) {
        var m = CS_MAKES.filter(function (x) { return x.k === w.k; })[0];
        return '<li' + (mk && mk.k === w.k ? ' class="on"' : '') + '><b>' + esc(m.t) + '</b><span>' + esc(w.w) + '</span>' + (w.ex ? '<small>Приклади кодів: ' + esc(w.ex) + '</small>' : '') + '</li>';
      }).join('') +
      '<li><b>RAL</b><span>Промислова шкала кольорів, не автомобільний код: «RAL» + 4 цифри, напр. RAL 9010. Беруть з документації, проєкту або віяла RAL.</span></li></ul>';
  }
  function csResHTML() {
    var r = csSearch(cs.code, cs.make), q = r.q;
    if (q.length < 2) {
      var n2 = PRODUCTS.filter(function (p) { return p.sub === 'emal2k'; }).length, nb = PRODUCTS.filter(function (p) { return p.sub === 'baza'; }).length;
      return '<p class="cs__intro">Шукаємо серед готових кольорів у каталозі: ' + n2 + ' ' + plural(n2, 'автоемаль', 'автоемалі', 'автоемалей') + ' 2K PALINAL і ' + nb + ' ' + plural(nb, 'базова фарба', 'базові фарби', 'базових фарб') + ' під лак. Введіть код з таблички авто або RAL.</p>';
    }
    var mkName = cs.make.trim(), main = r.list.filter(function (x) { return x.rel !== 'other'; }), other = r.list.filter(function (x) { return x.rel === 'other'; });
    var tg = '<a class="btn btn--bot btn--full cs__tg" href="' + esc(csTgHref(q, mkName)) + '" target="_blank" rel="noopener" data-cs-tg>' + pkIc('tg', 18) + '<span>Замовити підбір у Telegram</span></a>';
    var h = '';
    if (main.length) {
      h += '<h3 class="cs__h">' + csIc(CS_IC.can, 19) + 'Є в каталозі (' + main.length + ')</h3><ul class="cs__list">' + main.map(csCard).join('') + '</ul>' +
        '<p class="cs__warn">' + csIc(CS_IC.info, 15) + '<span>Звірте марку і назву кольору: однаковий код у різних виробників означає різні кольори' + (r.mk ? '' : ' — вкажіть марку авто для точнішого пошуку') + '. Відтінок одного коду також може мати варіанти.</span></p>';
    } else {
      h += '<div class="cs__none"><h3 class="cs__h">' + csIc(CS_IC.can, 19) + 'Готового кольору «' + esc(q) + '»' + (mkName ? ' для ' + esc(mkName) : '') + ' у каталозі зараз немає</h3>' +
        '<p>У каталозі — лише готові кольори PALINAL, і цього коду серед них немає. Уточніть наявність і підбір кольору в Telegram: надішліть марку, модель, рік випуску і код фарби, а краще — фото таблички з кодом.</p></div>';
    }
    if (other.length) h += '<h3 class="cs__h cs__h--sub">Той самий код в іншої марки — це інший колір</h3><ul class="cs__list">' + other.map(csCard).join('') + '</ul>';
    h += '<div class="cs__acts">' + tg + '<a class="btn btn--o" href="tel:' + CONFIG.phone + '">' + csIc(IC.phone, 18) + '<span>' + CONFIG.phoneLabel + '</span></a>' +
      '<a class="btn btn--o" href="#/c/emal2k" data-cs-cat>' + csIc(CS_IC.can, 18) + '<span>Усі готові кольори</span></a></div>';
    if (!main.length && r.mk) { var w = CS_WHERE.filter(function (x) { return x.k === r.mk.k; })[0]; if (w) h += '<p class="cs__wmini">' + csIc(CS_IC.pin, 16) + '<span><b>Де код на ' + esc(r.mk.t) + ':</b> ' + esc(w.w) + '</span></p>'; }
    return h;
  }
  function renderCode() {
    var body = $('#codebody'); if (!body) return;
    if (!$('#csform')) {
      body.innerHTML = '<form class="cs__form" id="csform" autocomplete="off" novalidate>' +
        '<label class="cs__f cs__f--code"><span>Код фарби або RAL</span><input id="cs-code" type="text" maxlength="24" autocapitalize="characters" autocorrect="off" spellcheck="false" placeholder="Напр.: LY9B, 040, 475, RAL 9010" enterkeyhint="search"></label>' +
        '<label class="cs__f"><span>Марка авто <i>— необов’язково</i></span><input id="cs-make" type="text" maxlength="30" list="cs-makes" autocorrect="off" spellcheck="false" placeholder="Напр.: Toyota" enterkeyhint="search"></label>' +
        '<datalist id="cs-makes">' + ['Volkswagen', 'Audi', 'Škoda', 'Seat', 'Toyota', 'Lexus', 'BMW', 'Mercedes-Benz', 'Ford', 'Renault', 'Dacia', 'Peugeot', 'Citroën', 'Opel', 'Hyundai', 'Kia', 'Honda', 'Nissan', 'Chevrolet', 'Volvo', 'Fiat', 'Lada'].map(function (m) { return '<option value="' + m + '">'; }).join('') + '</datalist>' +
        '<button class="btn btn--y cs__go" type="submit">' + csIc(CS_IC.search, 18) + '<span>Знайти</span></button></form>' +
        '<div class="cs__ex"><span>Приклади:</span>' + ['RAL 9010', 'LY9B', '040', '475', '1G3'].map(function (x) { return '<button type="button" data-cs-ex="' + x + '">' + x + '</button>'; }).join('') + '</div>' +
        '<div id="cs-res" class="cs__res" aria-live="polite"></div>' +
        '<details class="cs__where" id="cs-where"><summary>' + csIc(CS_IC.pin, 20) + '<span>Де знайти код фарби</span>' + csIc('<path d="m6 9 6 6 6-6"/>', 18) + '</summary><div id="cs-wbody"></div></details>';
    }
    $('#cs-code').value = cs.code; $('#cs-make').value = cs.make;
    csUpdate();
  }
  function csUpdate() {
    var res = $('#cs-res'); if (!res) return;
    res.innerHTML = csResHTML();
    var wb = $('#cs-wbody'); if (wb) wb.innerHTML = csWhereHTML(CS_WHERE.filter(function (w) { var m = csMake(cs.make); return m && w.k === m.k; })[0] || null);
    fillPhotos();
  }
  var csTimer = null, csTracked = '';
  function csTrack() { var key = cs.code.trim() + '|' + cs.make.trim(); if (cs.code.trim().length >= 2 && key !== csTracked) { csTracked = key; track('код-фарби', 'Фарба за кодом: ' + key); } }
  function openCode(q) {
    if (typeof q === 'string' && q) cs.code = q;
    if (location.hash !== '#code') { if (!/^#\/p\/|^#cart|^#compare|^#pick/.test(location.hash)) lastListHash = location.hash || '#/'; location.hash = '#code'; }
    else { renderCode(); showModal('#codemodal'); }
  }
  document.addEventListener('input', function (e) {
    var t = e.target; if (!t || (t.id !== 'cs-code' && t.id !== 'cs-make')) return;
    cs[t.id === 'cs-code' ? 'code' : 'make'] = t.value;
    clearTimeout(csTimer); csTimer = setTimeout(function () { csUpdate(); }, 220);
  });
  document.addEventListener('submit', function (e) {
    if (!e.target || e.target.id !== 'csform') return;
    e.preventDefault(); clearTimeout(csTimer);
    cs.code = $('#cs-code').value; cs.make = $('#cs-make').value; csUpdate(); csTrack();
    var r = $('#cs-res'), bx = $('#codemodal .modal__box'); if (r && bx && window.innerWidth < 761) bx.scrollTo({ top: Math.max(0, r.offsetTop - 12), behavior: 'smooth' });
    if (document.activeElement && document.activeElement.blur && window.innerWidth < 761) document.activeElement.blur();
  });
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-open-code],[data-cs-ex],[data-cs-where],[data-cs-tg],[data-cs-cat]'); if (!t) return;
    if (t.hasAttribute('data-open-code')) { e.preventDefault(); openCode(t.hasAttribute('data-code-q') ? state.q : null); return; }
    if (t.hasAttribute('data-cs-ex')) { cs.code = t.getAttribute('data-cs-ex'); $('#cs-code').value = cs.code; csUpdate(); csTrack(); return; }
    if (t.hasAttribute('data-cs-where')) { e.preventDefault(); var d = $('#cs-where'); if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); } return; }
    if (t.hasAttribute('data-cs-tg')) { csTrack(); track('код-фарби/telegram', 'Фарба за кодом → Telegram: ' + cs.code.trim() + ' ' + cs.make.trim()); return; }
    if (t.hasAttribute('data-cs-cat')) { hideModal(); return; } // link #/c/emal2k opens the category
  });

  /* ---------- 04.10.2026: картка товару — липка панель замовлення (видна, коли основний блок «В кошик» поза екраном) ---------- */
  var pmIO = null;
  function pmBarHTML(p) {
    var v = variantOf(p, pmState.vi), pr = hasPrice(p) ? uahTxt(unitPrice(p, pmState.vi)) : '';
    var txt = 'Вітаю! Хочу замовити: ' + p.name + (v ? ' (' + uahText(v.label) + ')' : '') + (pr ? ' — ' + pr : '') + '.\n' + productUrl(p);
    return '<div class="pmbar" id="pmbar">' +
      '<div class="pmbar__pr"><b>' + (hasPrice(p) ? uah(unitPrice(p, pmState.vi)) + (unitOld(p, pmState.vi) != null ? ' <s class="pmbar__old">' + uah(unitOld(p, pmState.vi)) + '</s>' : '') : 'Ціну уточнюйте') + '</b><span>' + esc(p.name) + '</span></div>' +
      '<a class="pmbar__ic" href="' + esc(CONFIG.orderTelegram + '?text=' + encodeURIComponent(txt)) + '" target="_blank" rel="noopener" aria-label="Замовити в Telegram" data-order="' + esc(p.id) + '">' + pkIc('tg', 20) + '</a>' +
      '<a class="pmbar__ic" href="tel:' + CONFIG.phone + '" aria-label="Подзвонити: ' + CONFIG.phoneLabel + '">' + svgI(IC.phone, 20) + '</a>' +
      '<button class="btn btn--y pmbar__add" type="button" data-addpm>' + svgI('<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>', 19) + '<span>В кошик</span></button>' +
    '</div>';
  }
  function pmBarWatch() {
    if (pmIO) { pmIO.disconnect(); pmIO = null; }
    var bar = $('#pmbar'), buy = $('#pm .pm__buy'), box = $('#pmodal .modal__box');
    if (!bar || !buy || !box || !('IntersectionObserver' in window)) return;
    bar.classList.add('is-off');
    pmIO = new IntersectionObserver(function (en) { bar.classList.toggle('is-off', en[0].isIntersecting); }, { root: box, threshold: 0 });
    pmIO.observe(buy);
  }

  /* ---------- init ---------- */
  renderCats(); renderBanner(); updateBadges(); cmpSync();
  stat('views'); // візит: раз за сесію вкладки на добу
  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver(function (en) { if (en[0].isIntersecting && shown < curList.length) renderMore(); }, { rootMargin: '600px 0px' });
    io.observe($('#more'));
  }
  var upd = $('#upd'); if (upd) upd.textContent = new Date(DATA.updated || Date.now()).toLocaleDateString('uk-UA');
  if (/^#\/c\/[\w-]+/.test(location.hash)) catScrollPending = true; // 08.10: посилання на розділ (поділилися / c/<cat>/) — одразу до товарів розділу, не на банер
  route();
})();
