// UI-01: picks the loading-screen title language before the game code loads.
// The final language comes from the platform (YG-06); this is only a first guess.
(function () {
  var match = /[?&]lang=([a-zA-Z]{2})/.exec(window.location.search);
  var code = (match ? match[1] : navigator.language || '').slice(0, 2).toLowerCase();
  var ru = code === 'ru' || code === 'be' || code === 'kk' || code === 'uz';
  document.documentElement.setAttribute('data-boot-lang', ru ? 'ru' : 'en');
})();
