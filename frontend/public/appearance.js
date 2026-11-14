(function () {
  'use strict';

  var KEY = 'nfnn.appearance';
  var SCHEMES = { light: 'light', dark: 'dark' };

  var chosen = null;
  try {
    chosen = window.localStorage.getItem(KEY);
  } catch (refused) {
    chosen = null;
  }
  if (!Object.prototype.hasOwnProperty.call(SCHEMES, chosen)) {
    return;
  }
  document.documentElement.setAttribute('data-appearance', chosen);
  var meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) {
    meta.setAttribute('content', SCHEMES[chosen]);
  }
})();
