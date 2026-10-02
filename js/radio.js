/* Alex_bes😈 — міні-плеєр «🎸 Радіо ROKS» (02.10.2026).
   Потік — офіційний з плеєра play.tavr.media/radioroks (ТАВР Медіа): https://online.radioroks.ua/RadioROKS (MP3 128 кбіт/с).
   Автостарт: пробуємо audio.play() одразу; якщо браузер блокує звук без дії користувача — вмикаємо на першу взаємодію
   (дотик / клік / клавіша / прокрутка; прокрутка сама по собі браузером не вважається дозволом, тож тоді чекаємо на дотик).
   Поставили на паузу — запам'ятовуємо в localStorage (alexbes_radio_off) і більше не вмикаємо самі. В адмінці не працює.
   v2: керування — вкладка «Радіо» в нижньому меню (мобільний) і кнопка в шапці (десктоп): усі [data-radio-toggle];
   гучність — лише на десктопі (повзунок у шапці), на телефоні — кнопками телефону. */
(function () {
  'use strict';
  if (/admin\.html$/i.test(location.pathname)) return; // ніколи не стартуємо в адмінці
  var STREAM = 'https://online.radioroks.ua/RadioROKS';
  var OFF_KEY = 'alexbes_radio_off', VOL_KEY = 'alexbes_radio_vol';
  var box = document.getElementById('radio'), btns = [].slice.call(document.querySelectorAll('[data-radio-toggle]'));
  var volBtn = document.getElementById('radio-volbtn'), volBox = document.getElementById('radio-vol'), range = document.getElementById('radio-range');
  if (!btns.length) return;
  var isCtl = function (el) { return !!(el && el.closest && el.closest('[data-radio-toggle], #radio')); };
  var ls = function (k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } };
  var ss = function (k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { return null; } };
  var audio = null, wantPlay = false;

  function getAudio() {
    if (audio) return audio;
    audio = new Audio();
    audio.preload = 'none';
    var v = parseInt(ss(VOL_KEY), 10); audio.volume = isNaN(v) ? 0.7 : Math.max(0, Math.min(1, v / 100));
    audio.addEventListener('playing', function () { wantPlay = true; });
    ['playing', 'pause', 'waiting', 'stalled', 'error', 'ended'].forEach(function (ev) { audio.addEventListener(ev, sync); });
    return audio;
  }
  function state() {
    if (!audio || !wantPlay) return 'off';
    if (audio.error) return 'err';
    if (!audio.paused && audio.readyState >= 3) return 'on';
    return 'load';
  }
  function sync() {
    var s = state();
    if (s === 'err') wantPlay = false;
    var act = s === 'on' || s === 'load';
    if (box) box.setAttribute('data-state', s);
    document.documentElement.setAttribute('data-radio', s);
    btns.forEach(function (b) {
      b.setAttribute('data-state', s);
      b.setAttribute('aria-pressed', act ? 'true' : 'false');
      b.setAttribute('aria-label', act ? 'Пауза — Радіо ROKS' : 'Увімкнути Радіо ROKS');
      b.title = s === 'err' ? 'Не вдалося підключитися до Радіо ROKS — спробуйте ще раз' : act ? 'Пауза — Радіо ROKS' : 'Радіо ROKS';
    });
  }
  function play(fromUser) {
    var a = getAudio();
    if (a.error || !a.src) { a.src = STREAM + (a.src ? '?t=' + Date.now() : ''); }
    wantPlay = true; sync();
    var p;
    try { p = a.play(); } catch (e) { p = Promise.reject(e); }
    return Promise.resolve(p).then(function () {
      wantPlay = true; if (fromUser) ls(OFF_KEY, null);
      ss('alexbes_radio_on', '1'); sync(); return true;
    }, function () { if (a.paused) { wantPlay = false; sync(); } return false; });
  }
  function pause() {
    wantPlay = false;
    if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); } // зупиняємо й потік (live — не буферизуємо у фоні)
    ls(OFF_KEY, '1'); ss('alexbes_radio_on', '0'); sync();
  }

  function toggle() { var s = state(); if (s === 'on' || s === 'load') pause(); else { disarm(); play(true); } }
  btns.forEach(function (b) { b.addEventListener('click', toggle); });
  if (box && volBtn && volBox && range) {
    var vol0 = parseInt(ss(VOL_KEY), 10); range.value = isNaN(vol0) ? 70 : vol0; volBtn.classList.toggle('is-mute', +range.value === 0);
    volBtn.addEventListener('click', function () { volBox.hidden = !volBox.hidden; volBtn.setAttribute('aria-expanded', String(!volBox.hidden)); });
    range.addEventListener('input', function () { getAudio().volume = range.value / 100; ss(VOL_KEY, range.value); volBtn.classList.toggle('is-mute', +range.value === 0); });
    document.addEventListener('click', function (e) { if (!volBox.hidden && !box.contains(e.target)) { volBox.hidden = true; volBtn.setAttribute('aria-expanded', 'false'); } });
    // iOS Safari не дає змінювати гучність із JS (лише кнопками телефону) — там повзунок не показуємо
    var t = new Audio(); try { t.volume = 0.5; } catch (e) {} if (t.volume !== 0.5) volBtn.hidden = true;
  }

  /* автостарт */
  var GESTURES = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown', 'scroll'], armed = false;
  function onGesture(e) {
    if (e && e.target && e.target.nodeType === 1 && isCtl(e.target)) { disarm(); return; } // дотик до самого плеєра / вкладки «Радіо» — керує кнопка
    if (e && e.type === 'keydown' && e.key === 'Escape') return;
    if (state() === 'on') { disarm(); return; }
    play(false).then(function (ok) { if (ok) disarm(); }); // прокрутка без дотику не дає дозволу — тоді лишаємось чекати
  }
  function arm() { if (armed) return; armed = true; GESTURES.forEach(function (g) { window.addEventListener(g, onGesture, { capture: true, passive: true }); }); }
  function disarm() { if (!armed) return; armed = false; GESTURES.forEach(function (g) { window.removeEventListener(g, onGesture, { capture: true, passive: true }); }); }

  if (box) box.hidden = false;
  btns.forEach(function (b) { b.hidden = false; });
  sync();
  var isBot = navigator.webdriver && !/[?&]radiotest=1/.test(location.search); // автотести/боти — без автозвуку
  if (ls(OFF_KEY) !== '1' && !isBot) {
    play(false).then(function (ok) { if (!ok) arm(); });
  }
})();
