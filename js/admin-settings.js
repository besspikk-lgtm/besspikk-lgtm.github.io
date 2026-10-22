/* 22.10.2026: адмінка → «Налаштування». Пише службовий запис products/_site (hidden:true, JSON у description — у межах чинних правил).
   Сайт читає його в js/site-settings.js; порожнє поле = значення за замовчуванням (як зараз на сайті). */
import { esc, authErr } from './fb-common.js?v=2';

const B = (k, t, h) => ({ k, t, h, b: true });
const T = (k, t, h, d, big) => ({ k, t, h, d, big });
export const SECTIONS = [
  { id: 'notice', t: 'Оголошення вгорі сайту', items: [
    B('show_notice', 'Показувати оголошення', 'Жовта смуга з вашим текстом над усім сайтом (на всіх сторінках).'),
    T('notice', 'Текст оголошення', 'Наприклад: «Вихідні 1–3 листопада, замовлення приймаємо в Telegram». Порожнє — смуги немає.', '', true)] },
  { id: 'contacts', t: 'Контакти і посилання', items: [
    T('phone', 'Телефон', 'Формат +380XXXXXXXXX. Міняє кнопки «Подзвонити», WhatsApp і Viber на всіх сторінках.', '+380995264262'),
    T('tg', 'Особистий Telegram (нік без @)', 'Куди ведуть «Отримати консультацію» і посилання «Telegram @…».', 'alex_bespik'),
    T('consult', 'Текст повідомлення «Отримати консультацію»', 'Початок повідомлення, яке відкривається в Telegram; далі сайт сам додає назву товару чи розділу.', 'Добрий день! Потрібна консультація щодо:'),
    T('bot', 'Бот для замовлень (нік без @)', 'Зараз на сайті не показується (замовлення через бота тимчасово вимкнено). Бот і далі надсилає статуси.', 'AlexBes_order_bot'),
    T('channel', 'Telegram-канал магазину (нік без @)', 'Верхня плашка, смуга контактів і підвал.', 'alex_bes_shoping'),
    T('tiktok', 'TikTok (нік без @)', 'Посилання в підвалі та контактах.', 'alex_bespik'),
    T('insta', 'Instagram (нік без @)', 'Посилання в підвалі та контактах.', 'alex_bespik')] },
  { id: 'top', t: 'Верхня плашка каналу і смуга контактів', items: [
    B('show_tg', 'Показувати плашку Telegram-каналу', 'Синя плашка «Telegram-магазин Alex_bes shop» на самому верху.'),
    T('tg_title', 'Заголовок плашки', '', 'Telegram-магазин Alex_bes shop'),
    T('tg_sub', 'Підпис плашки', '', 'Тут розіграші й акції для найкращих!'),
    T('tg_btn', 'Текст кнопки плашки', '', 'Перейти'),
    B('show_cta', 'Показувати смугу «Телефон · Telegram-канал»', 'Тонка смуга з телефоном і каналом під плашкою.')] },
  { id: 'head', t: 'Шапка сайту', items: [
    T('brand_sub', 'Підпис під назвою', 'Рядок під «Alex_bes» у шапці та підвалі.', 'Meiji · Palinal · інструмент для малярів'),
    T('search_ph', 'Підказка в полі пошуку', '', 'Пошук: Meiji, 923, RAL 9010, розчинник…'),
    B('show_radio', 'Показувати Радіо ROKS', 'Кнопка радіо в шапці й нижньому меню.')] },
  { id: 'home', t: 'Головна сторінка: блоки і заголовки', items: [
    B('show_bnr', 'Показувати банер з відео', 'Банер кузовних робіт з кнопкою консультації та «Як доїхати».'),
    T('hero_btn', 'Текст кнопки на банері', '', 'Отримати консультацію'),
    B('show_cats', 'Показувати плитки «Категорії»', ''),
    T('cats_title', 'Заголовок блоку категорій', '', 'Категорії'),
    B('show_tips', 'Показувати блок «Поради»', ''),
    T('tips_title', 'Заголовок блоку порад', '', ''),
    B('show_recent', 'Показувати «Ви переглядали»', 'Блок нещодавно переглянутих товарів.'),
    B('show_how', 'Показувати блок «Як замовити»', 'Разом з контактами (тексти — у наступному розділі).'),
    B('show_seo', 'Показувати SEO-текст унизу', 'Великий текст для Google внизу головної. Радимо не вимикати.'),
    T('seo_h2', 'Заголовок SEO-тексту', '', 'Фарбопульти, автофарби та ремонт авто — Чернівці і вся Україна')] },
  { id: 'how', t: 'Блок «Як замовити»', items: [
    T('how_title', 'Заголовок блоку', '', 'Як замовити'),
    T('step1t', 'Крок 1 — заголовок', '', 'Оберіть товар'), T('step1d', 'Крок 1 — текст', '', '', true),
    T('step2t', 'Крок 2 — заголовок', '', 'Надішліть замовлення'), T('step2d', 'Крок 2 — текст', 'Зараз: замовлення на сайті, у Telegram або WhatsApp.', '', true),
    T('step3t', 'Крок 3 — заголовок', '', 'Підтвердимо ціну і наявність'), T('step3d', 'Крок 3 — текст', '', '', true),
    T('step4t', 'Крок 4 — заголовок', '', 'Оплата і доставка'), T('step4d', 'Крок 4 — текст', '', '', true),
    B('show_moti', 'Показувати картку «Коротко й по суті»', ''),
    T('moti_title', 'Заголовок картки', '', 'Коротко й по суті'),
    T('moti1', 'Абзац 1', '', '', true), T('moti2', 'Абзац 2', '', '', true),
    T('moti_sign', 'Підпис', '', 'Удачі в камері, колего! — Alex_bes')] },
  { id: 'footer', t: 'Підвал сайту', items: [
    T('ftr_about', 'Текст про магазин', 'Сірий рядок під логотипом у підвалі.', '', true),
    T('ftr_note', 'Примітка внизу', 'Після «Ціни оновлено: дата».', 'Ціни та наявність підтверджуються при замовленні.'),
    B('show_pop', 'Показувати «Популярні розділи»', ''),
    B('show_ua', 'Показувати «Слава Україні!»', '')] },
  { id: 'seo', t: 'Google (SEO) головної сторінки', items: [
    T('home_title', 'Заголовок вкладки браузера', 'До 60 символів. Так сторінку бачать у пошуку.', 'Фарбопульти Meiji, SATA і автофарби PALINAL | Alex_bes, Чернівці'),
    T('home_desc', 'Опис для Google', 'До 160 символів. Google може оновити не одразу.', '', true)] },
  { id: 'look', t: 'Кольори сайту', items: [
    { k: 'c_accent', t: 'Акцентний колір', h: 'Кнопки, ціни, посилання. За замовчуванням жовтий #ffd700.', c: '#ffd700' },
    { k: 'c_bg', t: 'Колір фону', h: 'За замовчуванням темно-синій #062457.', c: '#062457' }] },
  { id: 'stats', t: 'Статистика відвідувань', items: [
    B('gc', 'Рахувати відвідування в GoatCounter', 'Вимкніть, якщо не потрібна статистика alexbes.goatcounter.com. Внутрішня статистика адмінки працює окремо.')] }
];
const OTHER = [
  ['Ціни, наявність, опис, фото, відео, приховати товар', '#products', 'Товари'],
  ['Порядок товарів у розділі', '#products', 'Товари → Порядок'],
  ['Масова зміна цін і наявності, знижка на категорію', '#products', 'Товари'],
  ['Курс євро, акції до дати, промокоди', '#promo', 'Акції'],
  ['Статуси замовлень (Нове, Підтверджено, Відправлено, Оплачено, Скасовано)', '#orders', 'Замовлення'],
  ['Відгуки покупців', '#reviews', 'Відгуки']
];
const ICS = '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">';
const IC_SAVE = ICS + '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/></svg>';
const IC_GO = ICS + '<path d="M5 12h14M13 6l6 6-6 6"/></svg>';

let cur = {};
export function readSite(svc) {
  try { cur = JSON.parse((svc._site && svc._site.description) || '{}') || {}; } catch (e) { cur = {}; }
  return cur;
}
export function renderSettings(svc) {
  readSite(svc);
  const box = document.getElementById('set-box'); if (!box) return;
  if (box.querySelector('.set-sec [data-dirty]')) return; // не перетираємо незбережене
  box.innerHTML = '<p class="muted small">Порожнє поле — як зараз на сайті (сірий текст у полі). Зміни зʼявляються на сайті одразу після збереження (у відвідувачів — при наступному відкритті сторінки).</p>' +
    SECTIONS.map((s, i) => '<section class="adm-card set-sec" data-set="' + s.id + '"><h2 class="st-h2">' + (i + 1) + '. ' + esc(s.t) + '</h2><ol class="set-list">' +
      s.items.map((it, j) => {
        const id = 'set-' + it.k, n = (i + 1) + '.' + (j + 1);
        let ctl;
        if (it.b) ctl = '<label class="set-chk"><input type="checkbox" id="' + id + '" data-k="' + it.k + '"' + (cur[it.k] === false ? '' : ' checked') + '> Так</label>';
        else if (it.c) ctl = '<span class="set-col"><input type="color" id="' + id + '" data-k="' + it.k + '" data-c="1" value="' + esc(cur[it.k] || it.c) + '"' + (cur[it.k] ? '' : ' data-def="1"') + '><button class="lnk" type="button" data-set-reset="' + it.k + '">Як було</button></span>';
        else if (it.big) ctl = '<textarea id="' + id + '" data-k="' + it.k + '" rows="2" maxlength="600" placeholder="' + esc(it.d || 'Як зараз на сайті') + '">' + esc(cur[it.k] || '') + '</textarea>';
        else ctl = '<input id="' + id + '" data-k="' + it.k + '" maxlength="200" placeholder="' + esc(it.d || 'Як зараз на сайті') + '" value="' + esc(cur[it.k] || '') + '">';
        return '<li class="set-it"><label class="set-l" for="' + id + '"><b>' + n + '. ' + esc(it.t) + '</b>' + (it.h ? '<span class="muted small">' + esc(it.h) + '</span>' : '') + '</label>' + ctl + '</li>';
      }).join('') + '</ol><div class="set-act"><button class="btn btn--y adm-sm" type="button" data-set-save="' + s.id + '">' + IC_SAVE + 'Зберегти розділ</button><span class="muted small" data-set-msg></span></div></section>').join('') +
    '<section class="adm-card set-sec"><h2 class="st-h2">' + (SECTIONS.length + 1) + '. Що налаштовується в інших вкладках</h2><ol class="set-list">' +
    OTHER.map((o, j) => '<li class="set-it"><span class="set-l"><b>' + (SECTIONS.length + 1) + '.' + (j + 1) + '. ' + esc(o[0]) + '</b></span><a class="btn btn--o adm-sm" href="' + o[1] + '">' + IC_GO + esc(o[2]) + '</a></li>').join('') + '</ol></section>';
}
export async function settingsClick(t, fb, toast) {
  const r = t.closest('[data-set-reset]');
  if (r) { const i = document.getElementById('set-' + r.getAttribute('data-set-reset')); const it = SECTIONS.flatMap((s) => s.items).find((x) => x.k === r.getAttribute('data-set-reset')); i.value = it.c; i.setAttribute('data-def', '1'); i.setAttribute('data-dirty', '1'); return true; }
  const b = t.closest('[data-set-save]'); if (!b) return false;
  const sec = SECTIONS.find((s) => s.id === b.getAttribute('data-set-save')), el = b.closest('.set-sec'), msg = el.querySelector('[data-set-msg]');
  const next = Object.assign({}, cur);
  for (const it of sec.items) {
    const i = el.querySelector('[data-k="' + it.k + '"]');
    if (it.b) { if (i.checked) delete next[it.k]; else next[it.k] = false; }
    else if (it.c) { if (i.hasAttribute('data-def')) delete next[it.k]; else next[it.k] = i.value; }
    else { const v = i.value.trim(); if (v) next[it.k] = v; else delete next[it.k]; }
  }
  if (next.phone && !/^\+?380\d{9}$/.test(next.phone.replace(/[\s()-]/g, ''))) { msg.textContent = 'Телефон: формат +380XXXXXXXXX'; return true; }
  for (const k of ['tg', 'bot', 'channel', 'tiktok', 'insta']) if (next[k] && !/^@?[A-Za-z0-9_.]{3,40}$/.test(next[k])) { msg.textContent = 'Нік: лише латиниця, цифри, _ і крапка'; return true; }
  const json = JSON.stringify(next);
  if (json.length > 6000) { msg.textContent = 'Забагато тексту (ліміт 6000 символів на всі налаштування)'; return true; }
  b.disabled = true; msg.textContent = 'Зберігаю…';
  try {
    await fb.F.setDoc(fb.F.doc(fb.db, 'products', '_site'), { name: 'Налаштування сайту — тексти, контакти, блоки (службовий запис адмінки)', category: '', description: json, hidden: true, custom: true, createdAt: Date.now(), updatedAt: Date.now() });
    cur = next; el.querySelectorAll('[data-dirty]').forEach((x) => x.removeAttribute('data-dirty'));
    msg.textContent = 'Збережено'; toast('Розділ «' + sec.t + '» збережено');
  } catch (e) { msg.textContent = authErr(e); }
  b.disabled = false; return true;
}
export function settingsInput(t) {
  if (!t.closest || !t.closest('#set-box') || !t.hasAttribute('data-k')) return;
  t.setAttribute('data-dirty', '1'); if (t.hasAttribute('data-c')) t.removeAttribute('data-def');
}
