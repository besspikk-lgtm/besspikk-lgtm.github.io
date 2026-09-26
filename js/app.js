/* Alex_bes😈 catalog — vanilla JS, no build step. Works from file:// and any static host. */
(function () {
  'use strict';
  var CONFIG = {
    orderTelegram: 'https://t.me/alex_bespik', // особистий Telegram для замовлень
    whatsapp: 'https://wa.me/380995264262',
    viber: 'viber://chat?number=%2B380995264262',
    instagram: 'https://ig.me/m/alex_bespik',
    phone: '+380995264262', phoneLabel: '099 526 42 62',
    siteName: 'Alex_bes😈'
  };
  var DATA = window.ALEXBES_DATA || { categories: [], products: [] };
  var PRODUCTS = DATA.products, CATS = DATA.categories;
  var byId = {}; PRODUCTS.forEach(function (p) { byId[p.id] = p; });
  var catById = {}; CATS.forEach(function (c) { catById[c.id] = c; });

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var nf = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 2 });
  var eur = function (v) { return nf.format(v).replace(/\u202f|\u00a0/g, ' ') + ' €'; };

  var state = { cat: 'all', q: '', sort: 'def' };
  var lastListHash = '#/';

  /* ---------- storage ---------- */
  var mem = {};
  function load(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return mem[k] || d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { mem[k] = v; } }
  var cart = load('alexbes_cart', []).filter(function (l) { return byId[l.id]; });
  var form = load('alexbes_form', {});

  /* ---------- price helpers ---------- */
  function hasPrice(p) { return p.price_eur != null; }
  function variantOf(p, vi) { return p.variants && p.variants[vi] ? p.variants[vi] : null; }
  function unitPrice(p, vi) { var v = variantOf(p, vi); return v ? v.price_eur : p.price_eur; }
  function unitLabel(p, vi) { var v = variantOf(p, vi); return v ? v.label : (p.price_label || ''); }
  function pillHTML(p) {
    if (!hasPrice(p)) return '<span class="pill pill--ask">Ціну уточнюйте</span>';
    var from = p.variants && p.variants.length > 1 ? '<small>від</small>' : '';
    return '<span class="pill">' + from + eur(p.price_eur) + '</span>';
  }
  function stockHTML(p) {
    var s = p.in_stock || '';
    var cls = /немає/i.test(s) ? ' stock--out' : /наявн/i.test(s) && !/уточн/i.test(s) ? '' : /дороз|замовл/i.test(s) ? ' stock--way' : ' stock--ask';
    return '<span class="stock' + cls + '">' + esc(s) + '</span>';
  }

  /* ---------- catalog render ---------- */
  function renderCats() {
    var total = PRODUCTS.length;
    var items = [{ id: 'all', name: 'Усі товари', count: total, icon: '😈' }].concat(CATS);
    $('#catlist').innerHTML = items.map(function (c) {
      return '<li><a href="' + (c.id === 'all' ? '#/' : '#/c/' + c.id) + '" data-cat="' + c.id + '"><span>' + esc(c.name) + '</span><span class="n">' + c.count + '</span></a></li>';
    }).join('');
    $('#chips').innerHTML = items.map(function (c) {
      return '<a class="chip" role="tab" href="' + (c.id === 'all' ? '#/' : '#/c/' + c.id) + '" data-cat="' + c.id + '">' + esc(c.id === 'all' ? 'Усі' : c.name) + '<small>' + c.count + '</small></a>';
    }).join('');
  }
  function norm(s) { return String(s).toLowerCase().replace(/[’'`ʼ]/g, '').replace(/ґ/g, 'г'); }
  var index = {};
  PRODUCTS.forEach(function (p) {
    var t = norm([p.name, p.code || '', p.brand || '', p.category_name, p.description].join(' '));
    index[p.id] = t + ' ' + t.replace(/[.\-\/]/g, '');
  });
  function filtered() {
    var toks = norm(state.q).split(/\s+/).filter(Boolean);
    var list = PRODUCTS.filter(function (p) {
      if (state.cat !== 'all' && p.category !== state.cat) return false;
      return toks.every(function (t) { return index[p.id].indexOf(t) >= 0; });
    });
    var order = {}; CATS.forEach(function (c, i) { order[c.id] = i; });
    var oos = function (p) { return /немає/i.test(p.in_stock || '') ? 1 : 0; };
    var pr = function (p) { return hasPrice(p) ? p.price_eur : null; };
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
  function cardHTML(p, i) {
    var eager = i < 8 ? 'eager' : 'lazy';
    return '<li class="card"><div class="card__in">' +
      '<div class="card__media"><button class="card__img" type="button" data-open="' + p.id + '" aria-label="' + esc(p.name) + '"><img src="' + p.photo + '" alt="' + esc(p.name) + '" loading="' + eager + '" width="400" height="400"></button>' +
      '<button class="card__add" type="button" data-add="' + p.id + '" aria-label="Додати «' + esc(p.name) + '» в кошик">+</button></div>' +
      '<div class="card__body">' +
        '<span class="card__cat">' + esc(p.category_name) + (p.tds ? ' <span class="tdsb" title="Є технічні дані (ТДС)">ТДС</span>' : '') + '</span>' +
        '<button class="card__name" type="button" data-open="' + p.id + '">' + esc(p.name) + '</button>' +
        '<div class="card__foot">' + pillHTML(p) + stockHTML(p) +
        (!hasPrice(p) && p.price_uah_original ? '<span class="uah">у пості: ' + esc(p.price_uah_original) + '</span>' : '') +
        '</div>' +
      '</div></div></li>';
  }
  var PAGE = 48, curList = [], shown = 0, io = null;
  function renderMore() {
    var next = curList.slice(shown, shown + PAGE);
    $('#grid').insertAdjacentHTML('beforeend', next.map(function (p, i) { return cardHTML(p, shown + i); }).join(''));
    shown += next.length;
    var more = $('#more');
    more.hidden = shown >= curList.length;
    more.textContent = 'Показати ще (' + (curList.length - shown) + ')';
  }
  function renderGrid() {
    var list = filtered();
    curList = list; shown = 0;
    $('#grid').innerHTML = '';
    renderMore();
    $('#empty').hidden = list.length > 0;
    var title = state.cat === 'all' ? 'Усі товари' : catById[state.cat].name;
    if (state.q) title = 'Пошук: «' + state.q + '»' + (state.cat !== 'all' ? ' · ' + catById[state.cat].name : '');
    $('#restitle').textContent = title + ' (' + list.length + ')';
    $$('[data-cat]').forEach(function (a) { a.classList.toggle('on', a.getAttribute('data-cat') === state.cat); });
    var chip = $('.chip.on'); if (chip && chip.scrollIntoView && window.innerWidth < 900) { var c = $('#chips'); c.scrollLeft = chip.offsetLeft - 16; }
  }

  /* ---------- product modal ---------- */
  var pmState = { id: null, vi: 0, qty: 1 };
  function openProduct(id) {
    var p = byId[id]; if (!p) return;
    pmState = { id: id, vi: 0, qty: 1 };
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
  function renderProduct() {
    var p = byId[pmState.id];
    var vars = p.variants ? '<div class="vars" role="radiogroup" aria-label="Варіант">' + p.variants.map(function (v, i) {
      return '<button type="button" class="var' + (i === pmState.vi ? ' on' : '') + '" data-var="' + i + '" role="radio" aria-checked="' + (i === pmState.vi) + '">' + esc(v.label) + '<b>' + eur(v.price_eur) + '</b></button>';
    }).join('') + '</div>' : '';
    var price = hasPrice(p) ? '<span class="pill" style="font-size:22px;padding:7px 16px">' + eur(unitPrice(p, pmState.vi)) + (unitLabel(p, pmState.vi) ? ' <small>· ' + esc(unitLabel(p, pmState.vi)) + '</small>' : '') + '</span>'
      : '<span class="pill pill--ask" style="font-size:16px;padding:7px 16px">Ціну уточнюйте</span>' + (p.price_uah_original ? ' <span class="muted small">у пості: ' + esc(p.price_uah_original) + '</span>' : '');
    var src = (p.source || []).filter(function (u) { return /^https:\/\/t\.me\//.test(u); })[0];
    var tgAsk = 'https://t.me/share/url?url=' + encodeURIComponent('https://t.me/alex_bes_shoping') + '&text=' + encodeURIComponent('Вітаю! Цікавить: ' + p.name + (hasPrice(p) ? '' : ' — яка ціна?'));
    $('#pm').innerHTML =
      '<div class="pm__img"><img src="' + p.photo + '" alt="' + esc(p.name) + '"></div>' +
      '<div class="pm__info">' +
        '<span class="pm__cat">' + esc(p.category_name) + '</span>' +
        '<h2 id="pm-name">' + esc(p.name) + '</h2>' +
        '<div>' + price + '</div>' + vars +
        stockHTML(p) +
        '<p class="pm__desc">' + esc(p.description) + '</p>' +
        '<div class="pm__buy"><div class="qty"><button type="button" data-q="-1" aria-label="Менше">−</button><input id="pmq" type="number" min="1" value="' + pmState.qty + '" aria-label="Кількість"><button type="button" data-q="1" aria-label="Більше">+</button></div>' +
        '<button class="btn btn--y" type="button" data-addpm>🛒 Додати в кошик</button></div>' +
        '<div class="cactions">' +
          '<a class="btn btn--o" href="' + CONFIG.orderTelegram + '" target="_blank" rel="noopener">✈️ Telegram</a>' +
          '<a class="btn btn--o" href="' + CONFIG.whatsapp + '?text=' + encodeURIComponent('Вітаю! Цікавить: ' + p.name + (hasPrice(p) ? '' : ' — яка ціна?')) + '" target="_blank" rel="noopener">🟢 WhatsApp</a>' +
          '<a class="btn btn--o" href="' + CONFIG.viber + '">🟣 Viber</a>' +
          '<a class="btn btn--o" href="' + CONFIG.instagram + '" target="_blank" rel="noopener">📸 Instagram</a>' +
        '</div>' +
        specsHTML(p) + tdsHTML(p) +
        '<p class="pm__note">' + esc(p.price_note || '') + (src ? ' · <a href="' + src + '" target="_blank" rel="noopener">пост у каналі</a>' : '') + '</p>' +
      '</div>';
  }

  /* ---------- cart ---------- */
  function cartCount() { return cart.reduce(function (s, l) { return s + l.qty; }, 0); }
  function addToCart(id, vi, qty) {
    vi = vi || 0; qty = Math.max(1, qty || 1);
    var l = cart.filter(function (x) { return x.id === id && x.vi === vi; })[0];
    if (l) l.qty += qty; else cart.push({ id: id, vi: vi, qty: qty });
    save('alexbes_cart', cart); updateBadges();
    var p = byId[id];
    toast('Додано: ' + p.name + (variantOf(p, vi) ? ' (' + variantOf(p, vi).label + ')' : ''));
  }
  function updateBadges() {
    var n = cartCount();
    $$('[data-cart-count]').forEach(function (b) { b.textContent = n; b.hidden = n === 0; });
  }
  function orderText() {
    var lines = ['Вітаю! Хочу замовити (з сайту ' + CONFIG.siteName + '):', ''];
    var sum = 0, ask = 0;
    cart.forEach(function (l, i) {
      var p = byId[l.id], v = variantOf(p, l.vi), up = unitPrice(p, l.vi);
      var nm = p.name + (v ? ' (' + v.label + ')' : (p.price_label ? ' (' + p.price_label + ')' : ''));
      if (up != null) { sum += up * l.qty; lines.push((i + 1) + '. ' + nm + ' — ' + l.qty + ' шт × ' + eur(up) + ' = ' + eur(Math.round(up * l.qty * 100) / 100)); }
      else { ask++; lines.push((i + 1) + '. ' + nm + ' — ' + l.qty + ' шт — ціну уточнити'); }
    });
    lines.push('');
    lines.push('Разом: ' + eur(Math.round(sum * 100) / 100) + (ask ? ' + ' + ask + ' поз. з ціною на уточненні' : ''));
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
      if (up != null) sum += up * l.qty; else ask++;
      return '<li class="citem"><img src="' + p.photo + '" alt="">' +
        '<div><div class="citem__n">' + esc(p.name) + '</div><div class="citem__v">' + esc(v ? v.label : (p.price_label || '')) + '</div>' +
        '<div class="citem__p">' + (up != null ? eur(up) + ' × ' + l.qty : 'Ціну уточнюйте') + '</div></div>' +
        '<div class="citem__r"><div class="qty"><button type="button" data-cq="' + i + '" data-d="-1" aria-label="Менше">−</button><input type="number" min="1" value="' + l.qty + '" data-ci="' + i + '" aria-label="Кількість"><button type="button" data-cq="' + i + '" data-d="1" aria-label="Більше">+</button></div>' +
        '<button class="rm" type="button" data-rm="' + i + '">видалити</button></div></li>';
    }).join('');
    body.innerHTML = '<ul class="citems">' + items + '</ul>' +
      '<div class="ctotal"><span>Разом' + (ask ? ' <span class="muted small">(+ ' + ask + ' поз. на уточненні)</span>' : '') + '</span><b>' + eur(Math.round(sum * 100) / 100) + '</b></div>' +
      '<p class="cnote">Ціни в €. Остаточну ціну, наявність, доставку та оплату підтверджуємо в Telegram або телефоном.</p>' +
      '<div class="cform">' +
        '<label>Ім’я<input data-f="name" value="' + esc(form.name || '') + '" autocomplete="name"></label>' +
        '<label>Телефон<input data-f="phone" value="' + esc(form.phone || '') + '" type="tel" autocomplete="tel"></label>' +
        '<label class="full">Місто / доставка<input data-f="city" value="' + esc(form.city || '') + '" placeholder="Місто, спосіб доставки"></label>' +
        '<label class="full">Коментар<textarea data-f="note" rows="2" placeholder="Дюза, система, питання…">' + esc(form.note || '') + '</textarea></label>' +
      '</div>' +
      '<div class="cactions">' +
        '<button class="btn btn--y btn--full" type="button" data-send>✈️ Надіслати в Telegram</button>' +
        '<button class="btn btn--y" type="button" data-wa>🟢 WhatsApp</button>' +
        '<button class="btn btn--y" type="button" data-viber>🟣 Viber</button>' +
        '<button class="btn btn--b" type="button" data-ig>📸 Instagram</button>' +
        '<button class="btn btn--o" type="button" data-copy>📋 Скопіювати текст</button>' +
        '<a class="btn btn--o btn--full" href="tel:' + CONFIG.phone + '">📞 Подзвонити ' + CONFIG.phoneLabel + '</a>' +
      '</div>' +
      '<details class="preview"><summary>Текст замовлення</summary><pre id="otext"></pre></details>' +
      '<p class="cnote" style="margin-top:10px">Оберіть зручний месенджер. У WhatsApp текст підставиться сам, у Telegram, Viber та Instagram — текст копіюється, просто вставте його в чат.</p>';
    $('#otext').textContent = orderText();
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
    openModalEl.hidden = true; openModalEl = null; document.body.style.overflow = '';
    document.title = 'Alex_bes😈 — каталог: Meiji, SATA, Palinal, інструмент для малярів';
    if (/^#\/p\/|^#cart/.test(location.hash)) history.replaceState(null, '', lastListHash);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  var tt;
  function toast(msg) { var t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(tt); tt = setTimeout(function () { t.hidden = true; }, 2600); }

  /* ---------- routing ---------- */
  function route() {
    var h = location.hash || '#/';
    var m;
    if ((m = h.match(/^#\/p\/([\w-]+)/))) { openProduct(m[1]); return; }
    if (h === '#cart') { renderCart(); showModal('#cmodal'); return; }
    if (openModalEl) { openModalEl.hidden = true; openModalEl = null; document.body.style.overflow = ''; }
    if (h === '#how') { $$('[data-nav]').forEach(function (a) { a.classList.toggle('on', a.getAttribute('data-nav') === 'how'); }); return; }
    $$('[data-nav]').forEach(function (a) { a.classList.toggle('on', a.getAttribute('data-nav') === 'catalog'); });
    var prevCat = state.cat;
    if ((m = h.match(/^#\/c\/([\w-]+)/)) && catById[m[1]]) state.cat = m[1]; else state.cat = 'all';
    lastListHash = h;
    renderGrid();
    if (prevCat !== state.cat && window.scrollY > $('#catalog').offsetTop + 40) window.scrollTo(0, Math.max(0, $('#catalog').offsetTop - ($('.hdr') ? $('.hdr').offsetHeight : 0)));
  }

  /* ---------- events ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('button, a'); if (!t) { if (e.target.hasAttribute && e.target.hasAttribute('data-close')) hideModal(); return; }
    if (t.hasAttribute('data-close')) { e.preventDefault(); hideModal(); return; }
    if (t.hasAttribute('data-open')) { location.hash = '#/p/' + t.getAttribute('data-open'); return; }
    if (t.hasAttribute('data-add')) {
      var p = byId[t.getAttribute('data-add')];
      if (p.variants && p.variants.length > 1) { location.hash = '#/p/' + p.id; toast('Оберіть варіант'); return; }
      addToCart(p.id, 0, 1); return;
    }
    if (t.hasAttribute('data-var')) { pmState.vi = +t.getAttribute('data-var'); renderProduct(); return; }
    if (t.hasAttribute('data-q')) { pmState.qty = Math.max(1, (parseInt($('#pmq').value, 10) || 1) + +t.getAttribute('data-q')); $('#pmq').value = pmState.qty; return; }
    if (t.hasAttribute('data-addpm')) { pmState.qty = Math.max(1, parseInt($('#pmq').value, 10) || 1); addToCart(pmState.id, pmState.vi, pmState.qty); return; }
    if (t.hasAttribute('data-open-cart')) { e.preventDefault(); if (location.hash !== '#cart') { if (!/^#\/p\//.test(location.hash)) lastListHash = location.hash || '#/'; location.hash = '#cart'; } else { renderCart(); showModal('#cmodal'); } return; }
    if (t.hasAttribute('data-cq')) { var i = +t.getAttribute('data-cq'); cart[i].qty = Math.max(1, cart[i].qty + +t.getAttribute('data-d')); save('alexbes_cart', cart); updateBadges(); renderCart(); return; }
    if (t.hasAttribute('data-rm')) { cart.splice(+t.getAttribute('data-rm'), 1); save('alexbes_cart', cart); updateBadges(); renderCart(); return; }
    if (t.hasAttribute('data-copy')) { copyText(orderText()).then(function (ok) { toast(ok ? 'Текст замовлення скопійовано ✅' : 'Не вдалося скопіювати — виділіть текст нижче'); if (!ok) $('.preview').open = true; }); return; }
    if (t.hasAttribute('data-send')) {
      var w = window.open(CONFIG.orderTelegram, '_blank', 'noopener');
      copyText(orderText()).then(function (ok) { toast(ok ? 'Текст скопійовано — вставте його в чат Telegram ✅' : 'Відкрийте «Текст замовлення» і скопіюйте вручну'); if (!ok) $('.preview').open = true; });
      if (!w) location.href = CONFIG.orderTelegram;
      return;
    }
    if (t.hasAttribute('data-wa')) { window.open(CONFIG.whatsapp + '?text=' + encodeURIComponent(orderText()), '_blank', 'noopener'); return; }
    if (t.hasAttribute('data-viber') || t.hasAttribute('data-ig')) {
      var isV = t.hasAttribute('data-viber'), app = isV ? 'Viber' : 'Instagram';
      copyText(orderText()).then(function (ok) { toast(ok ? 'Текст скопійовано — вставте його в чат ' + app + ' ✅' : 'Відкрийте «Текст замовлення» і скопіюйте вручну'); if (!ok) $('.preview').open = true; });
      if (isV) location.href = CONFIG.viber; else window.open(CONFIG.instagram, '_blank', 'noopener');
      return;
    }
    if (t.hasAttribute('data-share')) { window.open('https://t.me/share/url?url=' + encodeURIComponent('https://t.me/alex_bes_shoping') + '&text=' + encodeURIComponent(orderText()), '_blank', 'noopener'); return; }
    if (t.id === 'more') { renderMore(); return; }
    if (t.hasAttribute('data-focus-search')) { e.preventDefault(); if (location.hash !== '#/' && !/^#\/c\//.test(location.hash)) location.hash = '#/'; window.scrollTo({ top: 0, behavior: 'smooth' }); setTimeout(function () { $('#q').focus(); }, 250); return; }
  });
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.id === 'q') { state.q = t.value.trim(); renderGridSearch(); return; }
    if (t.hasAttribute('data-f')) { form[t.getAttribute('data-f')] = t.value; save('alexbes_form', form); var o = $('#otext'); if (o) o.textContent = orderText(); return; }
    if (t.hasAttribute('data-ci')) { var i = +t.getAttribute('data-ci'); cart[i].qty = Math.max(1, parseInt(t.value, 10) || 1); save('alexbes_cart', cart); updateBadges(); var o2 = $('#otext'); if (o2) o2.textContent = orderText(); return; }
  });
  function renderGridSearch() {
    // search is global (all categories) like the reference; category chip resets to "all"
    if (state.q && state.cat !== 'all') { state.cat = 'all'; history.replaceState(null, '', '#/'); lastListHash = '#/'; }
    renderGrid();
    if (state.q && window.scrollY > $('#catalog').offsetTop + 200) $('#catalog').scrollIntoView({ behavior: 'smooth' });
  }
  $('#sort').addEventListener('change', function () { state.sort = this.value; renderGrid(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hideModal(); });
  window.addEventListener('hashchange', route);

  /* ---------- init ---------- */
  renderCats(); updateBadges();
  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver(function (en) { if (en[0].isIntersecting && shown < curList.length) renderMore(); }, { rootMargin: '600px 0px' });
    io.observe($('#more'));
  }
  var upd = $('#upd'); if (upd) upd.textContent = new Date(DATA.updated || Date.now()).toLocaleDateString('uk-UA');
  route();
})();
