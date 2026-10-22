/* 22.10.2026: «Поділитися» для статей /poradi/ — системне меню (navigator.share) + Telegram, Facebook, WhatsApp, копіювання посилання */
(function () {
  var box = document.querySelectorAll('[data-ashare]');
  if (!box.length) return;
  var url = (document.querySelector('link[rel=canonical]') || {}).href || location.href.split('#')[0];
  var title = (document.querySelector('meta[property="og:title"]') || {}).content || document.title;
  var u = encodeURIComponent(url), t = encodeURIComponent(title);
  Array.prototype.forEach.call(box, function (b) {
    var set = function (k, h) { var a = b.querySelector('[data-as="' + k + '"]'); if (a) a.href = h; };
    set('tg', 'https://t.me/share/url?url=' + u + '&text=' + t);
    set('fb', 'https://www.facebook.com/sharer/sharer.php?u=' + u);
    set('wa', 'https://wa.me/?text=' + t + '%20' + u);
    var nat = b.querySelector('[data-as="native"]');
    if (navigator.share && nat) {
      nat.hidden = false;
      nat.addEventListener('click', function () { navigator.share({ title: title, url: url }).catch(function () {}); });
    }
    var cp = b.querySelector('[data-as="copy"]'), lab = cp && cp.querySelector('span');
    if (cp) cp.addEventListener('click', function () {
      var done = function () { if (lab) { lab.textContent = 'Скопійовано'; setTimeout(function () { lab.textContent = 'Копіювати посилання'; }, 2000); } };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { window.prompt('Скопіюйте посилання:', url); });
      else { window.prompt('Скопіюйте посилання:', url); }
    });
  });
})();
