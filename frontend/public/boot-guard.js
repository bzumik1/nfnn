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
    var help = element('p', 'Když to nepomůže, napište nám na ', {
      margin: '0 0 auto',
      color: 'var(--color-text-muted, #475569)',
    });
    var mail = element('a', 'info@nfnn.cz', { color: 'inherit' });
    mail.setAttribute('href', 'mailto:info@nfnn.cz');
    help.appendChild(mail);
    help.appendChild(document.createTextNode('.'));
    panel.appendChild(title);
    panel.appendChild(text);
    panel.appendChild(button);
    panel.appendChild(help);
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
      window.location.reload();
      return;
    }
    showPanel();
  }

  window.setTimeout(check, TIMEOUT_MS);
})();
