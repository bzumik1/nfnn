import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runInNewContext } from 'node:vm';
import { APP_BADGE_SCRIPT } from './wrap-service-worker.mjs';

function badgingNavigator({ fails = false } = {}) {
  const shown = [];
  return {
    shown,
    setAppBadge: (count) => {
      shown.push(count);
      return fails ? Promise.reject(new Error('refused')) : Promise.resolve();
    },
    clearAppBadge: () => {
      shown.push(null);
      return fails ? Promise.reject(new Error('refused')) : Promise.resolve();
    },
  };
}

function installedBadge(navigator) {
  const listeners = [];
  const self = {
    navigator,
    addEventListener: (type, listener) => listeners.push({ type, listener }),
  };
  runInNewContext(APP_BADGE_SCRIPT, { self, Number });
  return listeners;
}

function pushed(listeners, data) {
  const waited = [];
  const event = {
    data:
      data === undefined
        ? null
        : {
            json: () => (typeof data === 'string' ? JSON.parse(data) : data),
          },
    waitUntil: (promise) => waited.push(promise),
  };
  for (const entry of listeners.filter((candidate) => candidate.type === 'push')) {
    entry.listener(event);
  }
  return waited;
}

describe('Given the badge part of the service worker', () => {
  describe('when an alert arrives with the count of open alerts while the app is closed', () => {
    it('then the icon shows that count and the worker waits for it', async () => {
      const navigator = badgingNavigator();
      const listeners = installedBadge(navigator);

      const waited = pushed(listeners, { v: 1, kind: 'backups-outage', count: 2 });

      assert.deepEqual(navigator.shown, [2]);
      assert.equal(waited.length, 1);
      await waited[0];
    });
  });

  describe('when the end of the last open alert arrives', () => {
    it('then the badge is cleared', () => {
      const navigator = badgingNavigator();
      const listeners = installedBadge(navigator);

      pushed(listeners, { v: 1, kind: 'backups-recovered', count: 0 });

      assert.deepEqual(navigator.shown, [null]);
    });
  });

  for (const [name, data] of [
    ['no count', { v: 1, kind: 'test' }],
    ['a negative count', { count: -1 }],
    ['a count above 999', { count: 1000 }],
    ['a fraction', { count: 1.5 }],
    ['a count written as text', { count: '2' }],
    ['a message that is not JSON', '{not json'],
    ['no data at all', undefined],
  ]) {
    describe(`when a push comes with ${name}`, () => {
      it('then the badge is left as it is', () => {
        const navigator = badgingNavigator();
        const listeners = installedBadge(navigator);

        const waited = pushed(listeners, data);

        assert.deepEqual(navigator.shown, []);
        assert.equal(waited.length, 0);
      });
    });
  }

  describe('when the browser has no badge on the icon', () => {
    it('then the push is left to the rest of the worker without an error', () => {
      const listeners = installedBadge({});

      assert.doesNotThrow(() => pushed(listeners, { count: 1 }));
    });
  });

  describe('when the browser refuses to set the badge', () => {
    it('then the worker still finishes the push without a rejected promise', async () => {
      const listeners = installedBadge(badgingNavigator({ fails: true }));

      const waited = pushed(listeners, { count: 1 });

      await assert.doesNotReject(waited[0]);
    });
  });
});
