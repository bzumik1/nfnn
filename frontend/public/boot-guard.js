(function () {
  'use strict';

  var TIMEOUT_MS = 15000;
  var RELOAD_WINDOW_MS = 60000;
  var RELOAD_KEY = 'nfnn.reload.boot';
  var RECOVERED_KEY = 'nfnn.boot.recovered';
  var STARTED = 'data-nfnn-started';
  var CODE_ARRIVED = 'data-nfnn-loading';
  var LONGEST_START_MS = 60000;
  var PANEL_ID = 'nfnn-boot-panel';
  var LAST_ATTEMPT_KEY = 'nfnn.boot.last';
  var RELOAD_REASONS = ['boot', 'chunk-load', 'update', 'unrecoverable'];
  var PAGES = [
    'o-nas',
    'prispet',
    'zasady-ochrany-osobnich-udaju',
    'aktuality',
    'projekty',
    'obnova-hesla',
    'pripojeni',
    'prvni-nastaveni',
    'potvrzeni-emailu',
    'overit',
    'aplikace',
    'darce',
    'donor',
    'sprava',
  ];
  var BROWSERS = [
    ['samsung', /SamsungBrowser\/(\d+)/],
    ['edge', /Edg(?:e|A|iOS)?\/(\d+)/],
    ['opera', /(?:OPR|OPiOS)\/(\d+)/],
    ['firefox', /(?:Firefox|FxiOS)\/(\d+)/],
    ['chrome', /(?:CriOS|Chrome)\/(\d+)/],
    ['safari', /Version\/(\d+)[\d.]* (?:Mobile\/\S+ )?Safari\//],
    [
      'safari',
      /\((?:iPhone|iPad|iPod);.*AppleWebKit\/[\d.]+ \(KHTML, like Gecko\)(?: Mobile\/\S+)?$/,
    ],
  ];
  var BUNDLE = /^main-[A-Z0-9]{8}\.js$/;
  var ANSWER_WAIT_MS = 2000;
  var NEARLY_FULL_FREE_BYTES = 50 * 1024 * 1024;
  var root = document.documentElement;

  function sessionStore() {
    try {
      return window.sessionStorage;
    } catch (refused) {
      return null;
    }
  }

  function claimReload(store) {
    try {
      var now = String(Date.now());
      var stored = store.getItem(RELOAD_KEY);
      var elapsed = Date.now() - Number(stored);
      if (stored !== null && elapsed >= 0 && elapsed < RELOAD_WINDOW_MS) {
        return false;
      }
      store.setItem(RELOAD_KEY, now);
      return store.getItem(RELOAD_KEY) === now;
    } catch (refused) {
      return false;
    }
  }

  function markRecovered(store) {
    try {
      store.setItem(RECOVERED_KEY, '1');
    } catch (refused) {
      return;
    }
  }

  function kept(store, key) {
    try {
      var value = store ? store.getItem(key) : null;
      return value !== null && value.length <= 512 ? value : null;
    } catch (refused) {
      return null;
    }
  }

  function secondsSince(at, now) {
    return typeof at === 'number' && isFinite(at) && at <= now
      ? Math.floor((now - at) / 1000)
      : null;
  }

  function previousAttempt(store, now) {
    var stored = kept(store, LAST_ATTEMPT_KEY);
    if (stored === null) {
      return null;
    }
    try {
      var attempt = JSON.parse(stored);
      var waitedSeconds = attempt.waitedSeconds;
      var secondsAgo = secondsSince(attempt.at, now);
      var valid =
        typeof attempt.panelShown === 'boolean' &&
        typeof attempt.codeArrived === 'boolean' &&
        typeof waitedSeconds === 'number' &&
        Math.floor(waitedSeconds) === waitedSeconds &&
        waitedSeconds >= 0 &&
        waitedSeconds <= 600 &&
        secondsAgo !== null &&
        secondsAgo <= 86400;
      return valid
        ? {
            panelShown: attempt.panelShown,
            codeArrived: attempt.codeArrived,
            waitedSeconds: waitedSeconds,
            secondsAgo: secondsAgo,
          }
        : null;
    } catch (unreadable) {
      return null;
    }
  }

  function keepAttempt(store, panelShown, codeArrived) {
    try {
      store.setItem(
        LAST_ATTEMPT_KEY,
        JSON.stringify({
          panelShown: panelShown,
          codeArrived: codeArrived,
          waitedSeconds: Math.round(waited / 1000),
          at: Date.now(),
        }),
      );
    } catch (refused) {
      return;
    }
  }

  function platform() {
    var agent = String(navigator.userAgent || '');
    var touches = navigator.maxTouchPoints || 0;
    var browser = 'other';
    var major = null;
    for (var index = 0; index < BROWSERS.length; index++) {
      var found = BROWSERS[index][1].exec(agent);
      if (found) {
        browser = BROWSERS[index][0];
        var number = Number(found[1]);
        major = number >= 1 && number <= 999 && Math.floor(number) === number ? number : null;
        break;
      }
    }
    var os = 'other';
    if (/Android/.test(agent)) {
      os = 'android';
    } else if (/iPhone|iPod/.test(agent)) {
      os = 'ios';
    } else if (/iPad/.test(agent) || (/Macintosh/.test(agent) && touches > 1)) {
      os = 'ipados';
    } else if (/Macintosh|Mac OS X/.test(agent)) {
      os = 'macos';
    } else if (/Windows/.test(agent)) {
      os = 'windows';
    } else if (/Linux|X11/.test(agent)) {
      os = 'linux';
    }
    var standalone =
      navigator.standalone === true ||
      (typeof window.matchMedia === 'function' &&
        window.matchMedia('(display-mode: standalone)').matches);
    return {
      browser: browser,
      browserMajor: major,
      os: os,
      display: standalone ? 'standalone' : 'browser',
    };
  }

  function page() {
    var path = window.location && window.location.pathname;
    if (path === '/') {
      return '/';
    }
    var first = typeof path === 'string' ? path.split('/')[1] : '';
    return PAGES.indexOf(first) >= 0 ? '/' + first : 'other';
  }

  function bundle() {
    var scripts = document.querySelectorAll('script[src]');
    for (var index = 0; index < scripts.length; index++) {
      try {
        var address = new URL(scripts[index].getAttribute('src'), window.location.href);
        var name = address.pathname.split('/').pop();
        if (
          address.origin === window.location.origin &&
          address.search === '' &&
          address.hash === '' &&
          BUNDLE.test(name)
        ) {
          return name;
        }
      } catch (unreadable) {
        continue;
      }
    }
    return null;
  }

  function present(check) {
    try {
      return Boolean(check());
    } catch (refused) {
      return false;
    }
  }

  function answered(question, use) {
    var done = false;
    function settle(value) {
      if (!done) {
        done = true;
        use(value);
      }
    }
    window.setTimeout(function () {
      settle(null);
    }, ANSWER_WAIT_MS);
    try {
      var asked = question();
      if (!asked || typeof asked.then !== 'function') {
        settle(null);
        return;
      }
      asked.then(settle, function () {
        settle(null);
      });
    } catch (refused) {
      settle(null);
    }
  }

  function gather(now) {
    var store = sessionStore();
    var reloads = {};
    for (var index = 0; index < RELOAD_REASONS.length; index++) {
      var stored = kept(store, 'nfnn.reload.' + RELOAD_REASONS[index]);
      var since = stored === null ? null : secondsSince(Number(stored), now);
      reloads[RELOAD_REASONS[index]] = since !== null && since <= 86400 ? since : null;
    }
    var workers = navigator.serviceWorker;
    var storage = navigator.storage;
    var file = {
      format: 'nfnn-diagnostics',
      version: 1,
      createdAt: null,
      source: 'boot-panel',
      app: {
        revision: 'unknown',
        bundle: bundle(),
        started: root.hasAttribute(STARTED),
        codeArrived: root.hasAttribute(CODE_ARRIVED),
      },
      platform: platform(),
      page: page(),
      network: { browserOnline: navigator.onLine !== false, appOffline: null, offlineCause: null },
      support: {
        serviceWorker: present(function () {
          return 'serviceWorker' in navigator;
        }),
        indexedDb: present(function () {
          return 'indexedDB' in window;
        }),
        webLocks: present(function () {
          return navigator.locks;
        }),
        broadcastChannel: present(function () {
          return typeof window.BroadcastChannel === 'function';
        }),
        subtleCrypto: present(function () {
          return window.crypto && window.crypto.subtle;
        }),
        webAuthn: present(function () {
          return typeof window.PublicKeyCredential === 'function';
        }),
        webAssembly: present(function () {
          return typeof WebAssembly === 'object';
        }),
        storageManager: present(function () {
          return storage;
        }),
        trustedTypes: present(function () {
          return window.trustedTypes;
        }),
      },
      storage: { persisted: null, nearlyFull: null },
      serviceWorker: {
        controlled: present(function () {
          return workers && workers.controller;
        }),
        registrations: null,
        active: null,
        waiting: null,
        installing: null,
        caches: null,
      },
      reloads: reloads,
      boot: {
        recovered: kept(store, RECOVERED_KEY) !== null,
        previous: previousAttempt(store, now),
      },
      session: null,
      deviceCopy: null,
      events: [],
    };
    answered(
      function () {
        return storage && storage.persisted && storage.persisted();
      },
      function (persisted) {
        file.storage.persisted = typeof persisted === 'boolean' ? persisted : null;
      },
    );
    answered(
      function () {
        return storage && storage.estimate && storage.estimate();
      },
      function (estimate) {
        var usage = estimate && estimate.usage;
        var quota = estimate && estimate.quota;
        file.storage.nearlyFull =
          typeof usage === 'number' && typeof quota === 'number' && quota > 0
            ? quota - usage < NEARLY_FULL_FREE_BYTES || usage / quota >= 0.9
            : null;
      },
    );
    answered(
      function () {
        return workers && workers.getRegistrations && workers.getRegistrations();
      },
      function (registrations) {
        if (!registrations || typeof registrations.length !== 'number') {
          return;
        }
        var counts = { registrations: registrations.length, active: 0, waiting: 0, installing: 0 };
        for (var index = 0; index < registrations.length; index++) {
          counts.active += registrations[index].active ? 1 : 0;
          counts.waiting += registrations[index].waiting ? 1 : 0;
          counts.installing += registrations[index].installing ? 1 : 0;
        }
        file.serviceWorker.registrations = counts.registrations;
        file.serviceWorker.active = counts.active;
        file.serviceWorker.waiting = counts.waiting;
        file.serviceWorker.installing = counts.installing;
      },
    );
    answered(
      function () {
        return window.caches && window.caches.keys();
      },
      function (names) {
        file.serviceWorker.caches = names && typeof names.length === 'number' ? names.length : null;
      },
    );
    return file;
  }

  function saveFile(file) {
    var now = new Date(Date.now());
    var minute = now.toISOString().slice(0, 16);
    file.createdAt = minute + 'Z';
    var text = JSON.stringify(file, null, 2) + '\n';
    var url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    var link = document.createElement('a');
    link.href = url;
    link.download =
      'nfnn-diagnostika-' +
      minute.slice(0, 10) +
      '-' +
      minute.slice(11, 13) +
      minute.slice(14, 16) +
      '.json';
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 0);
  }

  function clearAndReload() {
    var cleared = [];
    var workers = navigator.serviceWorker;
    if (workers && workers.getRegistrations) {
      cleared.push(
        workers.getRegistrations().then(function (registrations) {
          return Promise.all(
            registrations.map(function (registration) {
              return registration.unregister();
            }),
          );
        }),
      );
    }
    if (window.caches) {
      cleared.push(
        window.caches.keys().then(function (names) {
          return Promise.all(
            names.map(function (name) {
              return window.caches.delete(name);
            }),
          );
        }),
      );
    }
    Promise.all(cleared)
      .catch(function () {
        return undefined;
      })
      .then(function () {
        window.location.reload();
      });
  }

  function element(tag, text, styles) {
    var made = document.createElement(tag);
    if (text) {
      made.textContent = text;
    }
    for (var name in styles) {
      made.style.setProperty(name, styles[name]);
    }
    return made;
  }

  function showPanel() {
    if (document.getElementById(PANEL_ID) || !document.body) {
      return;
    }
    var panel = element('section', '', {
      position: 'fixed',
      inset: '0',
      'z-index': '2147483647',
      display: 'flex',
      'flex-direction': 'column',
      'overflow-y': 'auto',
      gap: '1rem',
      padding: '1.5rem',
      background: 'var(--color-surface, #ffffff)',
      color: 'var(--color-text, #0f172a)',
      'font-family': 'var(--font-sans, system-ui, sans-serif)',
      'font-size': '1rem',
      'line-height': '1.5',
      'text-align': 'center',
    });
    panel.id = PANEL_ID;
    panel.setAttribute('role', 'alert');
    panel.setAttribute('aria-labelledby', PANEL_ID + '-title');
    var title = element('h1', 'Web se nenačetl', {
      margin: 'auto 0 0',
      'font-size': '1.5rem',
    });
    title.id = PANEL_ID + '-title';
    var text = element(
      'p',
      'Načítání trvá příliš dlouho. Zkontrolujte připojení k internetu, nebo web vyčistěte a načtěte znovu. Přihlášení a data uložená v tomto zařízení zůstanou.',
      { margin: '0 auto', 'max-width': '32rem' },
    );
    var button = element('button', 'Vyčistit a načíst znovu', {
      'align-self': 'center',
      'min-height': '2.75rem',
      padding: '0.5rem 1.25rem',
      border: '1px solid transparent',
      'border-radius': '0.75rem',
      background: 'var(--color-accent, #2563eb)',
      color: 'var(--color-on-accent, #ffffff)',
      font: 'inherit',
      'font-weight': '600',
      cursor: 'pointer',
    });
    button.type = 'button';
    button.addEventListener('click', function () {
      button.disabled = true;
      button.textContent = 'Načítáme znovu…';
      if (navigator.onLine === false) {
        window.location.reload();
        return;
      }
      clearAndReload();
    });
    var help = element(
      'p',
      'Když to nepomůže, stáhněte si diagnostický soubor a pošlete nám ho na ',
      {
        margin: '0 auto',
        'max-width': '32rem',
        color: 'var(--color-text-muted, #475569)',
      },
    );
    var mail = element('a', 'info@nfnn.cz', { color: 'inherit' });
    mail.setAttribute('href', 'mailto:info@nfnn.cz?subject=Diagnostick%C3%BD%20soubor');
    help.appendChild(mail);
    help.appendChild(
      document.createTextNode(
        '. Je v něm jen stav webu v tomto zařízení, žádné vaše údaje ani hesla, a sám se nikam neodesílá.',
      ),
    );
    var download = element('button', 'Stáhnout diagnostický soubor', {
      'align-self': 'center',
      'min-height': '2.75rem',
      margin: '0 0 auto',
      padding: '0.5rem 1.25rem',
      border: '1px solid currentColor',
      'border-radius': '0.75rem',
      background: 'transparent',
      color: 'var(--color-accent, #2563eb)',
      font: 'inherit',
      'font-weight': '600',
      cursor: 'pointer',
    });
    download.type = 'button';
    download.className = 'nfnn-boot-diagnostics';
    var file = gather(Date.now());
    download.addEventListener('click', function () {
      try {
        saveFile(file);
      } catch (refused) {
        download.textContent = 'Soubor se nepodařilo připravit';
      }
    });
    panel.appendChild(title);
    panel.appendChild(text);
    panel.appendChild(button);
    panel.appendChild(help);
    panel.appendChild(download);
    document.body.appendChild(panel);
    if (window.MutationObserver) {
      var observer = new window.MutationObserver(function () {
        if (root.hasAttribute(STARTED)) {
          observer.disconnect();
          panel.remove();
        }
      });
      observer.observe(root, { attributes: true, attributeFilter: [STARTED] });
    }
  }

  var waited = 0;

  function check() {
    waited += TIMEOUT_MS;
    if (root.hasAttribute(STARTED)) {
      return;
    }
    var codeArrived = root.hasAttribute(CODE_ARRIVED);
    if (codeArrived && waited < LONGEST_START_MS) {
      window.setTimeout(check, TIMEOUT_MS);
      return;
    }
    var store = sessionStore();
    if (store) {
      markRecovered(store);
    }
    if (!codeArrived && store && navigator.onLine !== false && claimReload(store)) {
      keepAttempt(store, false, codeArrived);
      window.location.reload();
      return;
    }
    showPanel();
    if (store) {
      keepAttempt(store, true, codeArrived);
    }
  }

  window.setTimeout(check, TIMEOUT_MS);
})();
