/* Alex_bes — типи (підрозділи) розділів для адмінки: копія блоку SUBCATS з js/app.js (генерується з app.js, не правити вручну).
   typeOf(p) -> {k, t} — тип, у якому товар показується на сайті (або null, якщо в розділі немає типів). */
(function () {
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
    // 16.10.2026: «Товари з Китаю» (cn) — детальні типи за назвою (cnType)
    cn: { label: 'Тип', items: [
      { k: 'guns', t: 'Фарбопульти та пістолети', f: function (p) { return cnType(p) === 'guns'; } },
      { k: 'reg', t: 'Регулятори тиску', f: function (p) { return cnType(p) === 'reg'; } },
      { k: 'pneu', t: 'Пневмоінструмент', f: function (p) { return cnType(p) === 'pneu'; } },
      { k: 'blocks', t: 'Шліфувальні бруски', f: function (p) { return cnType(p) === 'blocks'; } },
      { k: 'abr', t: 'Абразиви та губки', f: function (p) { return cnType(p) === 'abr'; } },
      { k: 'pdr', t: 'ПДР і рихтування', f: function (p) { return cnType(p) === 'pdr'; } },
      { k: 'care', t: 'Чистка та аксесуари', f: function (p) { return cnType(p) === 'care'; } },
      { k: 'measure', t: 'Вимірювальні прилади', f: function (p) { return cnType(p) === 'measure'; } },
      { k: 'other', t: 'Інше', f: function (p) { return cnType(p) === 'other'; } }
    ] },
    abraz: { label: 'Тип', items: [
      { k: 'discs', t: 'Шліфувальні диски', f: function (p) { return abType(p) === 'discs'; } },
      { k: 'sheets', t: 'Листи та рулони', f: function (p) { return abType(p) === 'sheets'; } },
      { k: 'sponges', t: 'Губки та нетканий абразив', f: function (p) { return abType(p) === 'sponges'; } },
      { k: 'misc', t: 'Серветки та пасти', f: function (p) { return abType(p) === 'misc'; } }
    ] },
    mask: { label: 'Тип', items: [
      { k: 'tape', t: 'Малярні стрічки', f: function (p) { return /стрічк/i.test(p.name); } },
      { k: 'paper', t: 'Папір і плівка', f: function (p) { return !/стрічк/i.test(p.name); } }
    ] },
    shpak: { label: 'Бренд', items: [
      { k: 'palinal', t: 'PALINAL', f: function (p) { return /palinal/i.test(p.name); } },
      { k: 'novol', t: 'NOVOL', f: function (p) { return /novol/i.test(p.name); } },
      { k: 'other', t: 'Інші', f: function (p) { return !/palinal|novol/i.test(p.name); } }
    ] },
    savex: { label: 'Тип', items: [
      { k: 'thinner', t: 'Розчинники', f: function (p) { return /розчинник/i.test(p.name); } },
      { k: 'degreaser', t: 'Знежирювачі', f: function (p) { return /знежирювач/i.test(p.name); } },
      { k: 'cleaner', t: 'Для миття обладнання', f: function (p) { return !/розчинник|знежирювач/i.test(p.name); } }
    ] },
    guns: { label: 'Тип', items: [
      { k: 'spray', t: 'Фарбопульти', f: function (p) { return p.sub !== 'air' && !GUN_MINI.test(p.name); } },
      { k: 'mini', t: 'Міні-фарбопульти', f: function (p) { return p.sub !== 'air' && GUN_MINI.test(p.name); } },
      { k: 'special', t: 'Спеціальні пістолети', f: function (p) { return p.sub === 'air'; } }
    ] },
    budget: { label: 'Тип', items: [
      { k: 'guns', t: 'Фарбопульти', f: function (p) { return bdType(p) === 'guns'; } },
      { k: 'pps', t: 'PPS і аксесуари до фарбопультів', f: function (p) { return bdType(p) === 'pps'; } },
      { k: 'airbrush', t: 'Аерографи', f: function (p) { return bdType(p) === 'airbrush'; } },
      { k: 'pneu', t: 'Шліфмашинки і пневмоінструмент', f: function (p) { return bdType(p) === 'pneu'; } },
      { k: 'blocks', t: 'Шліфувальні бруски', f: function (p) { return bdType(p) === 'blocks'; } },
      { k: 'abr', t: 'Абразиви і диски', f: function (p) { return bdType(p) === 'abr'; } },
      { k: 'pdr', t: 'PDR і кузовний інструмент', f: function (p) { return bdType(p) === 'pdr'; } },
      { k: 'reg', t: 'Регулятори тиску', f: function (p) { return bdType(p) === 'reg'; } },
      { k: 'other', t: 'Інше', f: function (p) { return bdType(p) === 'other'; } }
    ] },
  };
  var BD_TYPE = {
    'italco-gloss-x1': 'guns',
    'gun-sutu-rp5800-kit': 'guns',
    'gun-ntools-tested': 'guns',
    'gun-hvlp-graffiti': 'guns',
    'ntools-te20': 'guns',
    'gun-m9-pps': 'guns',
    'spi-pro-te20-sticker-bomb': 'guns',
    'gun-374': 'guns',
    'gun-375': 'guns',
    'gun-376': 'guns',
    'gun-primer-17-pps': 'guns',
    'ntools-5000b-upgrades': 'guns',
    'gun-hvlp-13': 'guns',
    'gun-377': 'guns',
    'italco-mini-3003': 'guns',
    'ntools-mini-5002': 'guns',
    'gun-pps-set': 'guns',
    'gun-mini-08': 'guns',
    'auarita-lion': 'guns',
    'auarita-mini': 'guns',
    'auarita-ps5': 'guns',
    'wall-mount-gun-holder': 'pps',
    'auarita-spj06': 'pps',
    'gun-cleaning-brushes-22': 'pps',
    'airbrush-gold-kit': 'airbrush',
    'airbrush-black-kit': 'airbrush',
    'airbrush-chrome-red-kit': 'airbrush',
    'airbrush-cordless-mini': 'airbrush',
    'baishangsi-straight-line-sander': 'pneu',
    'baishangsi-palm-sander-817': 'pneu',
    'baishangsi-orbital-sander-10000': 'pneu',
    'air-belt-sander-10x330': 'pneu',
    'baishangsi-mini-angle-polisher': 'pneu',
    'air-angle-die-grinder-90': 'pneu',
    'aeropro-da-sander': 'pneu',
    'baishangsi-sander': 'pneu',
    'aeropro-a313-sander': 'pneu',
    'sanding-block-kit-7': 'blocks',
    'sanding-frame-adjustable-arc': 'blocks',
    'sanding-block-vacuum-400x70': 'blocks',
    'sanding-block-vacuum-interchangeable': 'blocks',
    'sanding-block-dust-70x125-13h': 'blocks',
    'sanding-plate-spring-70x198': 'blocks',
    'dms-finecut-block': 'blocks',
    'sanding-block-vacuum-125x70-white': 'blocks',
    'sanding-block-dust-yellow': 'blocks',
    'sanding-block-dust-70x200': 'blocks',
    'sanding-block-velcro-black': 'blocks',
    'sanding-file-board-red': 'blocks',
    'strip-discs-quick-change-25': 'abr',
    'strip-discs-quick-change-black-30': 'abr',
    'strip-discs-black-king-2in-21': 'abr',
    'zirconia-sanding-belts-10x330-40': 'abr',
    'sanding-sponges-24-p80-p3000': 'abr',
    'sanding-discs-1in-polishing-set-131': 'abr',
    'sanding-discs-1in-hook-124': 'abr',
    'carbide-burrs-30': 'abr',
    'pdr-hook': 'pdr',
    'pdr-double-hammer-set': 'pdr',
    'pdr-knockdown-handle-set': 'pdr',
    'pdr-glue-puller-kit-red': 'pdr',
    'air-body-saw': 'pdr',
    'pdr-suction-cup-t-handle': 'pdr',
    'body-line-scriber-kit': 'pdr',
    'shpateli-85-600': 'pdr',
    'hardy-japonki': 'pdr',
    'app-sts3': 'pdr',
    'pdr-kit-lifter': 'pdr',
    'pdr-air-wedge-horn': 'pdr',
    'pdr-t-puller-22': 'pdr',
    'pdr-tapdown-lcqjb16': 'pdr',
    'pdr-rods-6': 'pdr',
    'pdr-tapdown-cztc20': 'pdr',
    'air-regulator-gauge-separator-red': 'reg',
    'air-regulator-filter-blue': 'reg',
    'air-regulator-gauge-set-2': 'reg',
    'air-regulator-gauge-adapter': 'reg',
    'foam-sprayer': 'other',
    'degreaser-pump': 'other',
    'washer-pump': 'other',
    'detailing-set': 'other',
    'mercator-gogrip': 'other',
    '3m-d7915-prefilters': 'other',
    'hw-300mini': 'other',
    'microfiber-cleaning-cloths-grey-10': 'other',
    'microfiber-towel-grey-yellow-double': 'other',
    'film-cutter-safety': 'other',
    'ppf-squeegee-kit-5': 'other',
    'car-clips-925': 'other',
  };
  /* 17.11.2026: типи «КИТАЙ» — за id (кожний товар рівно в одній групі). sub=china не змінюємо. Для нових з адмінки — за назвою. */
  function bdType(p) {
    if (p && p.id && BD_TYPE[p.id]) return BD_TYPE[p.id];
    var n = ((p && p.name) || '').toLowerCase();
    if (/аерограф/.test(n)) return 'airbrush';
    if (/фарбопульт|пістолет для антиграв|міні-джет/.test(n)) return 'guns';
    if (/pps|перехідник|чистки фарбопульт|кріплення настінне під фарбопульт/.test(n)) return 'pps';
    if (/регулятор тиску|манометр/.test(n)) return 'reg';
    if (/шліфмашин|бормашин|стрічковий напилок|полірувальна машинк/.test(n)) return 'pneu';
    if (/брусок|бруск|рубанок/.test(n)) return 'blocks';
    if (/диск|стрічк|губк|борфрез/.test(n)) return 'abr';
    if (/пдр|вм[’']ятин|рихтуван|шпател|кузовн|розмітник/.test(n)) return 'pdr';
    return 'other';
  }

  /* 16.10.2026: типи «Товари з Китаю» та «Абразиви» — за назвою (порядок перевірок важливий) */
  function cnType(p) {
    if (p.type === 'guns') return 'guns';
    if (/^pdr-/.test(p.id || '') && p.id !== 'pdr-hook') return 'pdr'; // 16.10: увесь колишній розділ «ПДР»
    var n = (p.name || '').toLowerCase();
    if (/товщиномір/.test(n)) return 'measure';
    if (/регулятор|манометр/.test(n)) return 'reg';
    if (/пневмат|шліфмашинк|бормашин/.test(n)) return 'pneu';
    if (/вм[’']ятин|рихтуван|пдр|розмітник/.test(n)) return 'pdr';
    if (/чистк|мийк|щітк/.test(n)) return 'care';
    if (/губк|диск|абразив|шліфувальні стрічки/.test(n)) return 'abr';
    if (/брус|рубанок/.test(n)) return 'blocks';
    return 'other';
  }
  function abType(p) {
    var n = (p.name || '').toLowerCase();
    if (/губк|скотч-брайт|нетканий/.test(n)) return 'sponges';
    if (/диск/.test(n)) return 'discs';
    if (/рулон|лист|аркуш|папір/.test(n)) return 'sheets';
    return 'misc';
  }
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
  function typeOf(p) {
    var s = SUBCATS[p.category]; if (!s) return null;
    for (var i = 0; i < s.items.length; i++) if (s.items[i].f(p)) return { k: s.items[i].k, t: s.items[i].t, label: s.label };
    return null;
  }
  window.AlexBesSubs = { SUBCATS: SUBCATS, typeOf: typeOf };
})();
