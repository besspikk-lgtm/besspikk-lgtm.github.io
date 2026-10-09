/* Alex_bes UX (09.10.2026): функції 1 2 3 4 5 6 — зібрано з ux/fN.js (ux_deploy.sh) */
/* --- f1 --- */
/* 1. Пошук з підказками в шапці: назва, бренд, код, дюза («1.3» = «1,3»), розділ і тип; топ-6 з фото й ціною, тап — картка товару */
(function () {
  'use strict';
  var A = window.AlexBesUX; if (!A) return;
  var input = document.getElementById('q'); if (!input) return;
  var form = input.closest('form') || input.parentNode;
  var MAX = 6;
  // розмовні й кириличні назви брендів -> як у каталозі
  var ALIAS = { 'мейджі': 'meiji', 'мейджи': 'meiji', 'мейжі': 'meiji', 'сата': 'sata', 'палінал': 'palinal', 'палинал': 'palinal', 'савекс': 'savex', 'нтулс': 'ntools', 'теросон': 'teroson', 'новол': 'novol', 'ровер': 'roberlo', 'роберло': 'roberlo', 'ковакс': 'kovax', 'смірдекс': 'smirdex', 'сія': 'sia' };
  function nz(s) { return A.norm(s).replace(/(\d),(\d)/g, '$1.$2').replace(/ё/g, 'е'); }
  function nozzles(p) { // дюзи з назви, варіантів і характеристик (лише наявні дані)
    var out = {}, add = function (t) { String(t || '').replace(/(?:^|[^\d.,])([0-2][.,]\d)(?![\d])/g, function (m, x) { var v = x.replace(',', '.'); if (+v >= 0.5 && +v <= 2.5) out[v] = 1; return m; }); };
    add(p.name);
    (p.variants || []).forEach(function (v) { if (v && /дюз|сопл/i.test(v.label || '')) add(v.label); });
    var rows = p.specs && p.specs.rows; if (rows) rows.forEach(function (r) { if (/^(дюз|сопл|система \/ дюз|дюза \/)/i.test(r[0]) && !/[–-]\s*\d/.test(r[1])) add(r[1]); });
    return Object.keys(out).sort();
  }
  A.nozzlesOf = nozzles;
  var IDX = null, idxFor = null;
  function build() {
    var list = A.products(); if (IDX && idxFor === list) return IDX;
    idxFor = list;
    IDX = list.map(function (p) {
      var sub = p.sub && A.subItem(p.category, p.sub) ? A.subItem(p.category, p.sub).t : '';
      if (!sub && A.SUBCATS[p.category]) A.SUBCATS[p.category].items.some(function (s) { if (s.f(p)) { sub = s.t; return true; } return false; });
      var noz = nozzles(p);
      return { p: p, name: nz(p.name), brand: nz((p.brand || '') + ' ' + (p.category === 'guns' || p.type === 'guns' ? A.gunBrand(p) : '')),
        code: nz(p.code || ''), cat: nz((p.category_name || '') + ' ' + sub), noz: noz.join(' '), desc: nz(p.description || '') };
    });
    return IDX;
  }
  function toks(q) {
    return nz(q).split(/[\s/]+/).filter(Boolean).map(function (t) { return ALIAS[t] || t; });
  }
  function score(e, ts) {
    var sc = 0;
    for (var i = 0; i < ts.length; i++) {
      var t = ts[i], s = 0, isNum = /^\d[.]\d$/.test(t);
      if (isNum && (' ' + e.noz + ' ').indexOf(' ' + t + ' ') >= 0) s = 6;
      else if (new RegExp('(^|[\\s(«"-])' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(e.name)) s = 5;
      else if (e.name.indexOf(t) >= 0) s = 4;
      else if (e.brand.indexOf(t) >= 0) s = 4;
      else if (e.code.indexOf(t) >= 0 || e.code.replace(/[.\-\/\s]/g, '').indexOf(t.replace(/[.\-\/]/g, '')) >= 0) s = 4;
      else if (e.cat.indexOf(t) >= 0) s = 3;
      else if (!isNum && t.length > 2 && e.desc.indexOf(t) >= 0) s = 1;
      if (!s) return 0;
      sc += s;
    }
    if (/немає/i.test(e.p.in_stock || '')) sc -= 0.5;
    return sc;
  }
  function search(q) {
    var ts = toks(q); if (!ts.length) return { list: [], n: 0 };
    var res = [];
    build().forEach(function (e, i) { var s = score(e, ts); if (s > 0) res.push({ e: e, s: s, i: i }); });
    res.sort(function (a, b) { return b.s - a.s || a.i - b.i; });
    return { list: res.slice(0, MAX).map(function (r) { return r.e; }), n: res.length };
  }
  var box = document.createElement('div');
  box.className = 'sugg'; box.id = 'sugg'; box.hidden = true; box.setAttribute('role', 'listbox'); box.setAttribute('aria-label', 'Підказки пошуку');
  form.appendChild(box);
  form.classList.add('search--sugg');
  input.setAttribute('aria-controls', 'sugg'); input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-expanded', 'false');
  var cur = -1, lastQ = '', timer = null;
  function hl(name, ts) { // підсвітка збігів у назві
    var s = A.esc(name);
    ts.forEach(function (t) {
      if (t.length < 2) return;
      var re = new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\./g, '[.,]').replace(/г/g, '[гґ]') + ')', 'ig');
      s = s.replace(/(<[^>]*>)|([^<]+)/g, function (m, tag, txt) { return tag || txt.replace(re, '<mark>$1</mark>'); });
    });
    return s;
  }
  function priceOf(p) {
    if (!A.hasPrice(p)) return '<span class="sugg__ask">Ціну уточнюйте</span>';
    var many = p.variants && p.variants.length > 1 && new Set(p.variants.map(function (v) { return v && v.price_eur; })).size > 1;
    return (many ? '<small>від</small> ' : '') + A.uah(p.price_eur);
  }
  function render(q) {
    var r = search(q), ts = toks(q);
    cur = -1;
    if (!q.trim()) { close(); return; }
    var h = '';
    if (!r.list.length) h = '<p class="sugg__none">Нічого не знайдено. Спробуйте інакше або напишіть у Telegram, підберемо.</p>';
    else h = '<ul class="sugg__list">' + r.list.map(function (e, i) {
      var p = e.p, meta = [];
      if (e.noz && /^\d[.]\d$/.test(ts.join(' ').trim())) meta.push((e.noz.indexOf(' ') > 0 ? 'Дюзи ' : 'Дюза ') + e.noz.replace(/\./g, ',').split(' ').join(' / '));
      meta.unshift(A.esc(p.category_name || ''));
      return '<li role="option" id="sugg-' + i + '" aria-selected="false"><a class="sugg__it" href="#/p/' + A.esc(p.id) + '" data-sugg="' + A.esc(p.id) + '">' +
        '<span class="sugg__img"><img ' + A.mainImg(p, '64px') + ' alt="" loading="lazy" decoding="async" width="56" height="56"></span>' +
        '<span class="sugg__t"><b>' + hl(p.name, ts) + '</b><small>' + meta.join(' · ') + '</small></span>' +
        '<span class="sugg__pr">' + priceOf(p) + '</span></a></li>';
    }).join('') + '</ul>';
    if (r.list.length) h += '<button class="sugg__all" type="button" data-sugg-all>' + (r.n > r.list.length ? 'Показати всі результати' : 'Показати в каталозі') + A.svgI('<path d="M5 12h14M13 6l6 6-6 6"/>', 16) + '</button>';
    box.innerHTML = h; box.hidden = false; input.setAttribute('aria-expanded', 'true');
    A.fillPhotos();
  }
  function showAll() { // каталог шукає за тим самим запитом: «мейджі» -> «meiji», «1,3» -> «1.3»
    var t = toks(input.value).join(' ');
    if (t && t !== input.value.trim().toLowerCase()) { input.value = t; input.dispatchEvent(new Event('input', { bubbles: true })); }
    clearTimeout(timer); lastQ = input.value;
    close(); input.blur(); setTimeout(A.scrollToResults, 30);
  }
  function close() { box.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); cur = -1; }
  function move(d) {
    var it = box.querySelectorAll('.sugg__it'); if (!it.length) return;
    if (cur >= 0) { it[cur].classList.remove('on'); it[cur].parentNode.setAttribute('aria-selected', 'false'); }
    cur = (cur + d + it.length) % it.length;
    it[cur].classList.add('on'); it[cur].parentNode.setAttribute('aria-selected', 'true'); input.setAttribute('aria-activedescendant', 'sugg-' + cur);
  }
  input.addEventListener('input', function () { var q = input.value; clearTimeout(timer); timer = setTimeout(function () { if (q !== lastQ) { lastQ = q; render(q); } }, 60); });
  input.addEventListener('focus', function () { if (input.value.trim()) render(input.value); });
  input.addEventListener('keydown', function (e) {
    if (box.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Escape') { close(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      var it = box.querySelectorAll('.sugg__it');
      if (cur >= 0 && it[cur]) it[cur].click(); else showAll();
    }
  });
  box.addEventListener('mousedown', function (e) { e.preventDefault(); }); // фокус лишається в полі
  box.addEventListener('click', function (e) {
    var a = e.target.closest('[data-sugg]');
    if (a) { A.track('пошук/підказка/' + a.getAttribute('data-sugg'), 'Підказка пошуку: ' + input.value.trim()); close(); input.blur(); return; } // посилання #/p/<id> відкриває картку
    if (e.target.closest('[data-sugg-all]')) showAll();
  });
  document.addEventListener('click', function (e) { if (!box.hidden && !form.contains(e.target)) close(); });
  window.addEventListener('hashchange', close);
})();
/* --- f2 --- */
/* 2. Фільтри в розділах: бренд, дюза (фарбопульти), ціна; у PALINAL тип — рядок «Тип» (з даних p.sub). Сортування не змінюється. */
(function () {
  'use strict';
  var A = window.AlexBesUX; if (!A) return;
  var st = A.state;
  var F = { key: null, brands: [], noz: [], pmin: null, pmax: null };
  var base = [], open = false;
  var GUNS = function (p) { return p.category === 'guns' || p.type === 'guns'; };
  if (A.SUBCATS.palinal) A.SUBCATS.palinal.label = 'Тип';
  function nozzles(p) {
    if (A.nozzlesOf) return A.nozzlesOf(p);
    var out = {}, add = function (t) { String(t || '').replace(/(?:^|[^\d.,])([0-2][.,]\d)(?![\d])/g, function (m, x) { var v = x.replace(',', '.'); if (+v >= 0.5 && +v <= 2.5) out[v] = 1; return m; }); };
    add(p.name);
    (p.variants || []).forEach(function (v) { if (v && /дюз|сопл/i.test(v.label || '')) add(v.label); });
    var rows = p.specs && p.specs.rows; if (rows) rows.forEach(function (r) { if (/^(дюз|сопл|система \/ дюз|дюза \/)/i.test(r[0]) && !/[–-]\s*\d/.test(r[1])) add(r[1]); });
    return Object.keys(out).sort();
  }
  var brandCanon = null, brandFor = null;
  function brands() { // канонічні назви брендів з даних (p.brand), без урахування регістру
    var list = A.products(); if (brandCanon && brandFor === list) return brandCanon;
    brandFor = list; brandCanon = {};
    var cnt = {};
    list.forEach(function (p) { var b = String(p.brand || '').trim(); if (!b) return; var k = b.toLowerCase(); cnt[k] = cnt[k] || {}; cnt[k][b] = (cnt[k][b] || 0) + 1; });
    Object.keys(cnt).forEach(function (k) { var best = null; Object.keys(cnt[k]).forEach(function (v) { if (!best || cnt[k][v] > cnt[k][best]) best = v; }); brandCanon[k] = best; });
    return brandCanon;
  }
  function brandOf(p) {
    if (p._uxb !== undefined && p._uxbFor === brandFor) return p._uxb;
    var bc = brands(), b = String(p.brand || '').trim(), r = '';
    if (b) r = bc[b.toLowerCase()] || b;
    else {
      var n = ' ' + String(p.name || '').toLowerCase() + ' ';
      Object.keys(bc).some(function (k) { if (k.length > 1 && new RegExp('[\\s(«"]' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s)»",.]').test(n)) { r = bc[k]; return true; } return false; });
    }
    p._uxb = r || 'Інші'; p._uxbFor = brandFor;
    return p._uxb;
  }
  function priceOf(p) { return A.hasPrice(p) ? A.toUah(p.price_eur) : null; }
  function active() { return F.brands.length + F.noz.length + (F.pmin != null || F.pmax != null ? 1 : 0); }
  function enabled() { return !st.q && st.cat !== 'all'; }
  function showBrand() { return st.cat !== 'guns'; } // у фарбопультах бренд — рядок «Бренд» вище
  function pass(p, skip) {
    if (skip !== 'b' && F.brands.length && F.brands.indexOf(brandOf(p)) < 0) return false;
    if (skip !== 'n' && F.noz.length && !nozzles(p).some(function (z) { return F.noz.indexOf(z) >= 0; })) return false;
    if (skip !== 'p' && (F.pmin != null || F.pmax != null)) { var pr = priceOf(p); if (pr == null || (F.pmin != null && pr < F.pmin) || (F.pmax != null && (F.pexcl ? pr >= F.pmax : pr > F.pmax))) return false; }
    return true;
  }
  A.on('filter', function (list) {
    var key = st.cat; // тип/бренд у межах розділу фільтри не скидають
    if (key !== F.key) { F.key = key; F.brands = []; F.noz = []; F.pmin = F.pmax = null; F.pexcl = false; }
    if (!enabled()) { base = []; return; }
    base = list;
    if (!active()) return;
    return list.filter(function (p) { return pass(p); });
  });
  function facets() {
    var bm = {}, nm = {}, prs = [];
    base.forEach(function (p) {
      if (pass(p, 'b')) { var b = brandOf(p); bm[b] = (bm[b] || 0) + 1; }
      if (pass(p, 'n')) nozzles(p).forEach(function (z) { nm[z] = (nm[z] || 0) + 1; });
      var pr = priceOf(p); if (pr != null) prs.push(pr);
    });
    var bl = Object.keys(bm).sort(function (a, b) { return (a === 'Інші') - (b === 'Інші') || bm[b] - bm[a] || a.localeCompare(b, 'uk'); });
    F.brands.forEach(function (b) { if (bl.indexOf(b) < 0) { bl.push(b); bm[b] = 0; } });
    var nl = Object.keys(nm).sort(function (a, b) { return +a - +b; });
    F.noz.forEach(function (z) { if (nl.indexOf(z) < 0) { nl.push(z); nm[z] = 0; } });
    var isGun = base.some(GUNS);
    return { b: showBrand() && bl.length > 1 ? bl.map(function (k) { return [k, bm[k]]; }) : [],
      n: isGun && nl.length > 1 ? nl.map(function (k) { return [k, nm[k]]; }) : [],
      min: prs.length ? Math.min.apply(null, prs) : 0, max: prs.length ? Math.max.apply(null, prs) : 0, np: prs.length };
  }
  var EDGES = [500, 1000, 2000, 5000, 10000, 20000, 30000];
  function buckets(fc) {
    if (fc.np < 4) return [];
    var e = EDGES.filter(function (x) { return x > fc.min && x < fc.max; }); if (!e.length) return [];
    var out = [], lo = null;
    e.concat([null]).forEach(function (hi) { out.push([lo, hi]); lo = hi; });
    return out.map(function (r) { var n = base.filter(function (p) { var pr = priceOf(p); return pr != null && (r[0] == null || pr >= r[0]) && (r[1] == null || pr < r[1]) && pass(p, 'p'); }).length; return [r[0], r[1], n]; }).filter(function (r) { return r[2] > 0 || (F.pmin === r[0] && F.pmax === r[1]); });
  }
  var nf = function (n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0'); };
  function rangeLabel(lo, hi) { if (hi != null && F && !F.pexcl && lo != null) return nf(lo) + '–' + nf(hi) + '\u00a0грн'; return lo == null ? 'до ' + nf(hi) + '\u00a0грн' : hi == null ? 'від ' + nf(lo) + '\u00a0грн' : nf(lo) + '–' + nf(hi) + '\u00a0грн'; }
  var IC_F = '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>';
  var IC_X = '<path d="M6 6l12 12M18 6 6 18"/>';
  // рядок під заголовком: кнопка «Фільтри» + активні фільтри
  var bar = document.createElement('div'); bar.className = 'fbar'; bar.id = 'fbar'; bar.hidden = true;
  var anchor = document.getElementById('brandbar') || document.getElementById('subbar');
  if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(bar, anchor.nextSibling);
  function renderBar() {
    var fc = enabled() ? facets() : null;
    var any = fc && (fc.b.length || fc.n.length || buckets(fc).length || fc.np > 1);
    if (!any) { bar.hidden = true; return; }
    var n = active(), chips = [];
    F.brands.forEach(function (b) { chips.push('<button class="fchip" type="button" data-fx="b" data-v="' + A.esc(b) + '">' + A.esc(b) + A.svgI(IC_X, 14) + '</button>'); });
    F.noz.forEach(function (z) { chips.push('<button class="fchip" type="button" data-fx="n" data-v="' + z + '">Дюза ' + z.replace('.', ',') + A.svgI(IC_X, 14) + '</button>'); });
    if (F.pmin != null || F.pmax != null) chips.push('<button class="fchip" type="button" data-fx="p">' + rangeLabel(F.pmin, F.pmax) + A.svgI(IC_X, 14) + '</button>');
    bar.innerHTML = '<button class="fbtn' + (n ? ' on' : '') + '" type="button" data-fopen aria-haspopup="dialog">' + A.svgI(IC_F, 18) + '<span>Фільтри</span>' + (n ? '<b>' + n + '</b>' : '') + '</button>' +
      chips.join('') + (n > 1 ? '<button class="fclr" type="button" data-freset>Скинути все</button>' : '');
    bar.hidden = false;
  }
  // нижній аркуш з фільтрами
  var sh = document.createElement('div'); sh.className = 'fsheet'; sh.hidden = true;
  sh.innerHTML = '<div class="fsheet__bg" data-fclose></div><div class="fsheet__box" role="dialog" aria-modal="true" aria-labelledby="fsheet-t"><div class="fsheet__hd"><h2 id="fsheet-t">Фільтри</h2><button class="fsheet__x" type="button" data-fclose aria-label="Закрити">' + A.svgI(IC_X, 18) + '</button></div><div class="fsheet__body" id="fsheet-b"></div><div class="fsheet__ft"><button class="btn btn--o" type="button" data-freset>Скинути</button><button class="btn btn--y" type="button" data-fclose data-fshow></button></div></div>';
  document.body.appendChild(sh);
  function renderSheet() {
    var fc = facets(), h = '', sc = A.SUBCATS[st.cat];
    if (sc) {
      var inCat = A.products().filter(function (p) { return p.category === st.cat && (st.cat !== 'guns' || !st.brand || A.gunBrand(p) === st.brand) && pass(p); });
      var subs = [{ k: '', t: 'Усі', n: inCat.length }].concat(sc.items.map(function (x) { return { k: x.k, t: x.t, n: inCat.filter(x.f).length }; }).filter(function (x) { return x.n > 0 || x.k === st.sub; }));
      if (subs.length > 2) h += '<section class="fsec"><h3>' + A.esc(sc.label) + '</h3><div class="fopts">' + subs.map(function (x) { var on = st.sub === x.k; return '<button type="button" class="fopt' + (on ? ' on' : '') + '" aria-pressed="' + on + '" data-fsub="' + x.k + '">' + A.esc(x.t) + '<small>' + x.n + '</small></button>'; }).join('') + '</div></section>';
    }
    if (fc.b.length) h += '<section class="fsec"><h3>Бренд</h3><div class="fopts">' + fc.b.map(function (x) { var on = F.brands.indexOf(x[0]) >= 0; return '<button type="button" class="fopt' + (on ? ' on' : '') + '" aria-pressed="' + on + '" data-ft="b" data-v="' + A.esc(x[0]) + '"' + (!x[1] && !on ? ' disabled' : '') + '>' + A.esc(x[0]) + '<small>' + x[1] + '</small></button>'; }).join('') + '</div></section>';
    if (fc.n.length) h += '<section class="fsec"><h3>Дюза, мм</h3><div class="fopts">' + fc.n.map(function (x) { var on = F.noz.indexOf(x[0]) >= 0; return '<button type="button" class="fopt' + (on ? ' on' : '') + '" aria-pressed="' + on + '" data-ft="n" data-v="' + x[0] + '"' + (!x[1] && !on ? ' disabled' : '') + '>' + x[0].replace('.', ',') + '<small>' + x[1] + '</small></button>'; }).join('') + '</div></section>';
    if (fc.np > 1) {
      var bk = buckets(fc);
      h += '<section class="fsec"><h3>Ціна, грн</h3>' + (bk.length ? '<div class="fopts">' + bk.map(function (r) { var on = F.pmin === r[0] && F.pmax === r[1]; return '<button type="button" class="fopt' + (on ? ' on' : '') + '" aria-pressed="' + on + '" data-ft="p" data-lo="' + (r[0] == null ? '' : r[0]) + '" data-hi="' + (r[1] == null ? '' : r[1]) + '">' + rangeLabel(r[0], r[1]) + '<small>' + r[2] + '</small></button>'; }).join('') + '</div>' : '') +
        '<div class="frange"><label><span>від</span><input type="number" inputmode="numeric" min="0" step="100" data-fp="min" placeholder="' + nf(fc.min) + '" value="' + (F.pmin != null ? F.pmin : '') + '"></label><i></i><label><span>до</span><input type="number" inputmode="numeric" min="0" step="100" data-fp="max" placeholder="' + nf(fc.max) + '" value="' + (F.pmax != null ? F.pmax : '') + '"></label></div></section>';
    }
    if (!h) h = '<p class="fnone">Для цього розділу додаткових фільтрів немає.</p>';
    document.getElementById('fsheet-b').innerHTML = h;
    updCount();
  }
  function updCount() { var n = base.filter(function (p) { return pass(p); }).length; var b = sh.querySelector('[data-fshow]'); if (b) b.textContent = n ? 'Показати ' + A.countWord(n) : 'Нічого не знайдено'; }
  function apply(keepSheet) { A.renderGrid(); if (open && keepSheet !== false) renderSheet(); }
  function openSheet() { if (!enabled()) return; open = true; renderSheet(); sh.hidden = false; document.documentElement.classList.add('fs-on'); var x = sh.querySelector('.fsheet__x'); if (x) x.focus({ preventScroll: true }); A.track('фільтри/' + st.cat, 'Фільтри: відкрито (' + st.cat + ')'); }
  function closeSheet() { if (!open) return; open = false; sh.hidden = true; document.documentElement.classList.remove('fs-on'); var b = bar.querySelector('[data-fopen]'); if (b) b.focus({ preventScroll: true }); }
  function reset() { F.brands = []; F.noz = []; F.pmin = F.pmax = null; F.pexcl = false; apply(); }
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-fopen],[data-fclose],[data-freset],[data-ft],[data-fx],[data-fsub]'); if (!t) return;
    if (t.hasAttribute('data-fsub')) { subNav = true; var h = A.catHash(st.cat, t.getAttribute('data-fsub'), st.cat === 'guns' ? st.brand : ''); if (location.hash !== h) location.hash = h; else subNav = false; return; }
    if (t.hasAttribute('data-fopen')) { openSheet(); return; }
    if (t.hasAttribute('data-freset')) { reset(); if (!open) A.scrollToResults(); return; }
    if (t.hasAttribute('data-fclose')) { closeSheet(); if (t.hasAttribute('data-fshow')) A.scrollToResults(); return; }
    if (t.hasAttribute('data-fx')) { var k = t.getAttribute('data-fx'), v = t.getAttribute('data-v');
      if (k === 'b') F.brands = F.brands.filter(function (x) { return x !== v; }); else if (k === 'n') F.noz = F.noz.filter(function (x) { return x !== v; }); else { F.pmin = F.pmax = null; F.pexcl = false; }
      apply(); return; }
    var ft = t.getAttribute('data-ft'), val = t.getAttribute('data-v');
    if (ft === 'b' || ft === 'n') { var arr = ft === 'b' ? F.brands : F.noz, i = arr.indexOf(val); if (i >= 0) arr.splice(i, 1); else arr.push(val); }
    else if (ft === 'p') { var lo = t.getAttribute('data-lo'), hi = t.getAttribute('data-hi'); lo = lo === '' ? null : +lo; hi = hi === '' ? null : +hi; if (F.pmin === lo && F.pmax === hi) F.pmin = F.pmax = null; else { F.pmin = lo; F.pmax = hi; F.pexcl = hi != null; } }
    apply();
  });
  var inT = null;
  document.addEventListener('input', function (e) {
    var t = e.target; if (!t.hasAttribute || !t.hasAttribute('data-fp')) return;
    var v = t.value === '' ? null : Math.max(0, Math.round(+t.value) || 0);
    if (t.getAttribute('data-fp') === 'min') F.pmin = v; else { F.pmax = v; F.pexcl = false; }
    clearTimeout(inT); inT = setTimeout(function () { A.renderGrid(); updCount(); $$opts(); }, 250);
  });
  function $$opts() { Array.prototype.forEach.call(sh.querySelectorAll('[data-ft="p"]'), function (b) { var lo = b.getAttribute('data-lo'), hi = b.getAttribute('data-hi'); var on = F.pmin === (lo === '' ? null : +lo) && F.pmax === (hi === '' ? null : +hi); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }); }
  document.addEventListener('keydown', function (e) { if (open && e.key === 'Escape') { e.stopPropagation(); closeSheet(); } }, true);
  var subNav = false;
  window.addEventListener('hashchange', function () { if (subNav) { subNav = false; return; } closeSheet(); });
  A.on('grid', function () { renderBar(); if (open) { if (enabled()) renderSheet(); else closeSheet(); } });
  A.renderGrid();
})();
/* --- f3 --- */
/* 3. Картка товару: липка панель знизу — «Замовити в Telegram» поруч із «В кошик» (посилання те саме, що й у панелі: t.me/alex_bespik з назвою, варіантом, ціною і посиланням) */
(function () {
  'use strict';
  var A = window.AlexBesUX; if (!A) return;
  var TG = '<path d="M21.2 4.2 2.9 11.3c-.8.3-.8 1.4 0 1.7l4.6 1.6 1.8 5.5c.2.7 1.1.9 1.6.4l2.6-2.5 4.6 3.4c.6.4 1.4.1 1.6-.6l3-15.4c.2-.8-.6-1.5-1.3-1.2z"/><path d="m7.5 14.6 9.8-6.6-6.9 7.6"/>';
  var CART = '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>';
  function upgrade() {
    var bar = document.getElementById('pmbar'); if (!bar || bar.classList.contains('pmbar--ux')) return;
    var tg = bar.querySelector('a.pmbar__ic[data-order]'), pr = bar.querySelector('.pmbar__pr'), add = bar.querySelector('.pmbar__add');
    if (!tg || !add) return;
    var href = tg.getAttribute('href'), id = tg.getAttribute('data-order');
    bar.classList.add('pmbar--ux'); bar.classList.remove('is-off');
    bar.innerHTML = (pr ? '<div class="pmbar__pr">' + pr.innerHTML + '</div>' : '') +
      '<div class="pmbar__row">' +
        '<a class="btn btn--o pmbar__tg" href="' + A.esc(href) + '" target="_blank" rel="noopener" data-order="' + A.esc(id) + '" data-tgbar>' + A.svgI(TG, 18) + '<span>Замовити в Telegram</span></a>' +
        '<button class="btn btn--y pmbar__add" type="button" data-addpm>' + A.svgI(CART, 18) + '<span>В кошик</span></button>' +
      '</div>';
  }
  A.on('product', upgrade);
  upgrade(); // картка могла відкритися (пряме посилання) ще до завантаження цього файлу
})();
/* --- f4 --- */
/* 4. Повноекранний перегляд фото: стрічка мініатюр, свайп униз — закрити, лінійні SVG-іконки замість символів; зум і свайп — як були */
(function () {
  'use strict';
  var A = window.AlexBesUX; if (!A) return;
  var lb = A.lb;
  var I_X = '<path d="M6 6l12 12M18 6 6 18"/>', I_L = '<path d="m15 18-6-6 6-6"/>', I_R = '<path d="m9 18 6-6-6-6"/>';
  var I_EXP = '<path d="M14.5 4H20v5.5"/><path d="M20 4l-6.5 6.5"/><path d="M9.5 20H4v-5.5"/><path d="M4 20l6.5-6.5"/>';
  function zoomBtn() { // кнопка «на весь екран» у картці
    var z = document.querySelector('#pm .pm__zoom'); if (z && !z.querySelector('svg')) z.innerHTML = A.svgI(I_EXP, 18);
  }
  A.on('product', zoomBtn); zoomBtn();
  A.on('lbOpen', function (p) {
    var el = lb.el; if (!el) return;
    el.classList.add('lb--ux');
    var x = el.querySelector('.lb__x'); if (x) x.innerHTML = A.svgI(I_X, 20);
    var np = el.querySelector('.lb__nav--p'), nn = el.querySelector('.lb__nav--n');
    if (np) np.innerHTML = A.svgI(I_L, 22); if (nn) nn.innerHTML = A.svgI(I_R, 22);
    var hint = el.querySelector('.lb__hint');
    if (hint && !matchMedia('(hover:hover) and (pointer:fine)').matches) hint.textContent = 'Два пальці або подвійний тап — зум · свайп униз — закрити';
    if (lb.n > 1) { // мініатюри: ті самі фото (400 px копії)
      var imgs = el.querySelectorAll('.lb__img'), h = '<div class="lb__thumbs" role="tablist" aria-label="Фото">';
      A.galleryOf(p).forEach(function (g, i) {
        h += '<button type="button" class="lb__th' + (i === lb.i ? ' on' : '') + '" data-lb-th="' + i + '" role="tab" aria-selected="' + (i === lb.i) + '" aria-label="Фото ' + (i + 1) + '"><img ' + A.imgAttrs(p, g, '72px') + ' alt="" decoding="async" draggable="false"></button>';
      });
      el.insertAdjacentHTML('beforeend', h + '</div>');
      A.fillPhotos();
    }
  });
  A.on('lbPos', function (i) {
    var el = lb.el; if (!el) return;
    var th = el.querySelectorAll('.lb__th');
    for (var k = 0; k < th.length; k++) { var on = k === i; th[k].classList.toggle('on', on); th[k].setAttribute('aria-selected', on); if (on && th[k].scrollIntoView && th[k].parentNode.scrollWidth > th[k].parentNode.clientWidth) th[k].parentNode.scrollTo({ left: th[k].offsetLeft - th[k].parentNode.clientWidth / 2 + th[k].offsetWidth / 2, behavior: 'smooth' }); }
  });
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-lb-th]'); if (!t || !lb.open) return;
    A.lbGo(+t.getAttribute('data-lb-th'), false);
  });
  // свайп униз (без зуму, одним пальцем) — закрити перегляд
  var d = null, pts = 0;
  function sl() { return lb.el && lb.el.querySelectorAll('.lb__sl')[lb.i]; }
  function setY(y, anim) {
    var s = sl(); if (!s) return;
    s.style.transition = anim ? 'transform .25s ease' : 'none';
    s.style.transform = y ? 'translate3d(0,' + y + 'px,0) scale(' + Math.max(0.85, 1 - Math.abs(y) / 1600) + ')' : '';
    lb.el.style.backgroundColor = y ? 'rgba(2,6,14,' + Math.max(0.35, 1 - Math.abs(y) / 450) + ')' : '';
  }
  function down(e) {
    if (!lb.open || e.target.closest('button')) return;
    pts++;
    if (pts > 1 || lb.s > 1.01 || e.pointerType === 'mouse') { if (d) { setY(0, true); d = null; } return; }
    d = { id: e.pointerId, x: e.clientX, y: e.clientY, t: Date.now(), on: false };
  }
  function move(e) {
    if (!d || d.id !== e.pointerId) return;
    if (lb.s > 1.01 || pts > 1) { setY(0, true); d = null; return; }
    var dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.on) { if (Math.abs(dy) < 10 || Math.abs(dy) < Math.abs(dx) * 1.3) { if (Math.abs(dx) > 12) d = null; return; } d.on = true; }
    setY(dy > 0 ? dy : dy * 0.3, false);
  }
  function up(e) {
    pts = Math.max(0, pts - 1);
    if (!d || d.id !== e.pointerId) return;
    var dy = e.clientY - d.y, fast = dy > 60 && Date.now() - d.t < 260, was = d.on; d = null;
    if (!was) return;
    if (dy > 120 || fast) { var s = sl(); setY(0, false); if (s) s.style.transform = ''; A.lbClose(); return; }
    setY(0, true);
  }
  function bind() {
    if (!lb.el || lb.el._ux) return; lb.el._ux = 1;
    lb.el.addEventListener('pointerdown', down);
    lb.el.addEventListener('pointermove', move);
    lb.el.addEventListener('pointerup', up);
    lb.el.addEventListener('pointercancel', up);
  }
  A.on('lbOpen', function () { pts = 0; d = null; if (lb.el) lb.el.style.backgroundColor = ''; bind(); });
})();
/* --- f5 --- */
/* 5. Головна: блок «Чому Alex_bes» — 4 факти, лінійні SVG-іконки; лише на головній (як «Категорії») */
(function () {
  'use strict';
  var A = window.AlexBesUX; if (!A) return;
  var C = A.CONFIG;
  var I = {
    paint: '<path d="M4 7h11.5a2.5 2.5 0 0 1 2.5 2.5V11h-4l-1.2 2.2H9.5L8.4 20H5l1.2-7H4z"/><path d="M18 9h2.5M10 4h3.5v3"/>',
    badge: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8 7.5 9.5 4.3-1.5 7.5-4.9 7.5-9.5V6z"/><path d="m8.8 12 2.2 2.2 4.3-4.4"/>',
    video: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10.5 9.3 4.2 2.7-4.2 2.7z"/>',
    chat: '<path d="M12 3.5c-4.8 0-8.5 3.2-8.5 7.6 0 2.5 1.2 4.6 3.2 6v3.4l3.2-1.9c.7.1 1.4.2 2.1.2 4.8 0 8.5-3.3 8.5-7.7S16.8 3.5 12 3.5z"/><path d="M8.5 10h7M8.5 13h4.5"/>'
  };
  var items = [
    ['paint', 'Практикуючий маляр', 'Фарбую і роблю кузовний ремонт у Чернівцях, тож про інструмент і матеріали розповідаю з власної роботи.'],
    ['badge', 'Meiji і PALINAL', 'Офіційний представник Meiji і PALINAL в Україні: фарбопульти Meiji, автоемалі, лаки й ґрунти PALINAL.'],
    ['video', '115 тис. підписників у TikTok', 'Показую фарбування й інструмент у роботі на каналі <a href="https://www.tiktok.com/@alex_bespik" target="_blank" rel="noopener">@alex_bespik</a>.'],
    ['chat', 'Консультація перед покупкою', 'Допоможу підібрати фарбопульт, дюзу чи матеріал: <a href="tel:' + C.phone + '">' + C.phoneLabel + '</a> або <a href="' + C.orderTelegram + '" target="_blank" rel="noopener" data-consult>Telegram</a>.']
  ];
  var sec = document.createElement('section');
  sec.className = 'why'; sec.id = 'why'; sec.setAttribute('aria-labelledby', 'why-ttl');
  sec.innerHTML = '<h2 id="why-ttl">Чому Alex_bes</h2><ul class="why__list">' + items.map(function (x) {
    return '<li class="why__it"><span class="why__ic">' + A.svgI(I[x[0]], 22) + '</span><div class="why__t"><h3>' + x[1] + '</h3><p>' + x[2] + '</p></div></li>';
  }).join('') + '</ul>';
  var strips = document.querySelector('.strips'), layout = document.querySelector('#catalog .layout');
  var host = strips || layout; if (!host || !host.parentNode) return;
  host.parentNode.insertBefore(sec, strips ? strips.nextSibling : layout);
  function sync() { sec.hidden = A.state.cat !== 'all' || !!A.state.q; }
  A.on('grid', sync); sync();
})();
/* --- f6 --- */
/* 6. Мобільний: шапка з пошуком липне згори, ховається при прокрутці вниз і з'являється при прокрутці вгору */
(function () {
  'use strict';
  var hdr = document.querySelector('.hdr'); if (!hdr) return;
  var mq = window.matchMedia('(max-width:760px)');
  var lastY = window.scrollY || 0, acc = 0, ticking = false, hidden = false;
  hdr.classList.add('hdr--auto');
  var mark = document.createElement('div'); mark.setAttribute('aria-hidden', 'true'); mark.style.cssText = 'height:0;margin:0;padding:0';
  hdr.parentNode.insertBefore(mark, hdr); // справжнє місце шапки (у липкої offsetTop змінюється)
  function set(h) { if (h === hidden) return; hidden = h; hdr.classList.toggle('hdr--hide', h); }
  function busy() { var a = document.activeElement; return (a && a.id === 'q') || hdr.contains(document.querySelector('.sugg:not([hidden])')); }
  function check() {
    ticking = false;
    var y = Math.max(0, window.scrollY || 0), dy = y - lastY; lastY = y;
    if (!mq.matches || busy()) { set(false); acc = 0; return; }
    var top = mark.offsetTop + hdr.offsetHeight; // поки шапка у своєму місці — завжди видно
    if (y <= top) { set(false); acc = 0; return; }
    if ((dy > 0) !== (acc > 0)) acc = 0;
    acc += dy;
    if (acc > 24) set(true); else if (acc < -14) set(false);
  }
  window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(check); } }, { passive: true });
  document.addEventListener('focusin', function (e) { if (e.target && e.target.id === 'q') set(false); });
  (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(function () { set(false); });
})();
