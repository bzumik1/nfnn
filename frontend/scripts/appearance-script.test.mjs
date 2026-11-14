import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { runInNewContext } from 'node:vm';
import { JSDOM } from 'jsdom';

const SERVICE = readFileSync(
  new URL('../src/app/core/appearance/appearance.ts', import.meta.url),
  'utf8',
);
const APPEARANCE_STORAGE_KEY = /APPEARANCE_STORAGE_KEY = '([^']+)'/.exec(SERVICE)[1];
const SOURCE = readFileSync(new URL('../public/appearance.js', import.meta.url), 'utf8');
const INDEX = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');

function pageAfterScript(storage) {
  const dom = new JSDOM(
    '<!doctype html><html lang="cs"><head><meta name="color-scheme" content="light dark"></head><body></body></html>',
  );
  const window = dom.window;
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get: () => {
      if (storage === 'refused') {
        throw new Error('refused');
      }
      return {
        getItem: (key) => (key in storage ? storage[key] : null),
      };
    },
  });
  runInNewContext(SOURCE, { window, document: window.document });
  const root = window.document.documentElement;
  return {
    appearance: root.getAttribute('data-appearance'),
    colorScheme: window.document.querySelector('meta[name="color-scheme"]').content,
  };
}

describe('Given the script that applies the chosen appearance before the page is drawn', () => {
  it('when the visitor chose the dark appearance, then the page is dark from its first paint', () => {
    assert.deepEqual(pageAfterScript({ [APPEARANCE_STORAGE_KEY]: 'dark' }), {
      appearance: 'dark',
      colorScheme: 'dark',
    });
  });

  it('when the visitor chose the light appearance, then the page is light from its first paint', () => {
    assert.deepEqual(pageAfterScript({ [APPEARANCE_STORAGE_KEY]: 'light' }), {
      appearance: 'light',
      colorScheme: 'light',
    });
  });

  it('when nothing or an unknown value is kept, then the page follows the device', () => {
    for (const storage of [{}, { [APPEARANCE_STORAGE_KEY]: 'blue' }]) {
      assert.deepEqual(pageAfterScript(storage), { appearance: null, colorScheme: 'light dark' });
    }
  });

  it('when the browser refuses the storage, then the page follows the device and nothing throws', () => {
    assert.deepEqual(pageAfterScript('refused'), { appearance: null, colorScheme: 'light dark' });
  });

  it('when index.html is read, then the script loads in the head as a classic script after the colour scheme, before anything is drawn', () => {
    const head = INDEX.slice(0, INDEX.indexOf('</head>'));
    assert.match(head, /<script src="appearance\.js"><\/script>/);
    assert.ok(head.indexOf('name="color-scheme"') < head.indexOf('appearance.js'));
  });
});
