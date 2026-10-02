/* Alex_bes😈 — розбір посилань на відео (TikTok, YouTube / Shorts, Instagram Reels). Спільне для сайту й адмінки. */
(function () {
  'use strict';
  function parseVideo(raw) {
    var s = String(raw || '').trim();
    if (!s) return null;
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    var u;
    try { u = new URL(s); } catch (e) { return null; }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    var h = u.hostname.toLowerCase().replace(/^(www|m|mobile)\./, ''), path = u.pathname, m;
    var url = 'https://' + u.hostname.toLowerCase() + u.pathname + u.search;
    // YouTube
    if (h === 'youtu.be') {
      m = path.match(/^\/([\w-]{11})/); if (m) return yt(m[1], url, false);
      return null;
    }
    if (h === 'youtube.com' || h === 'music.youtube.com' || h === 'youtube-nocookie.com') {
      var v = u.searchParams.get('v');
      if (v && /^[\w-]{11}$/.test(v)) return yt(v, url, false);
      m = path.match(/^\/(shorts|embed|live|v)\/([\w-]{11})/); if (m) return yt(m[2], url, m[1] === 'shorts');
      return null;
    }
    // TikTok
    if (h === 'tiktok.com' || /\.tiktok\.com$/.test(h)) {
      m = path.match(/\/video\/(\d{8,25})/) || path.match(/^\/(?:embed\/v2|embed|player\/v1|v)\/(\d{8,25})/) || path.match(/^\/v\/(\d{8,25})\.html/);
      if (m) return { type: 'tiktok', id: m[1], url: url, embed: 'https://www.tiktok.com/player/v1/' + m[1] + '?autoplay=1&rel=0&description=1', vertical: true, label: 'TikTok' };
      // short links (vm.tiktok.com/…, vt.tiktok.com/…, tiktok.com/t/…) can't be resolved in the browser -> open as a link
      if (/^(vm|vt)\.tiktok\.com$/.test(h) || /^\/t\/\w+/.test(path)) return { type: 'tiktok', id: null, url: url, embed: null, vertical: true, label: 'TikTok', short: true };
      return null;
    }
    // Instagram
    if (h === 'instagram.com' || h === 'instagr.am') {
      m = path.match(/^\/(?:[\w.]+\/)?(reels?|p|tv)\/([\w-]{5,40})/);
      if (m) { var kind = m[1] === 'p' ? 'p' : m[1] === 'tv' ? 'tv' : 'reel';
        return { type: 'instagram', id: m[2], url: 'https://www.instagram.com/' + kind + '/' + m[2] + '/', embed: 'https://www.instagram.com/' + kind + '/' + m[2] + '/embed', vertical: true, label: 'Instagram' }; }
      return null;
    }
    return null;
  }
  function yt(id, url, short) {
    return { type: 'youtube', id: id, url: url, embed: 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0&playsinline=1', thumb: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg', vertical: !!short, label: short ? 'YouTube Shorts' : 'YouTube' };
  }
  window.AlexBesMedia = { parseVideo: parseVideo, MAX_PHOTOS: 10, MAX_VIDEOS: 5 };
})();
