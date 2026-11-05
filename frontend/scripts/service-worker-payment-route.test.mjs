import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { runInNewContext } from 'node:vm';
import {
  PAYMENT_ROUTE_SCRIPT,
  wrapServiceWorker,
  unwrappedServiceWorkers,
  wrapServiceWorkers,
} from './wrap-service-worker.mjs';

const ORIGIN = 'https://nfnn.cz';
const PAYMENT =
  'SPD*1.0*ACC:CZ6520100000005544332217*AM:500.00*CC:CZK*MSG:DAR NOVA NADEJE*X-VS:1234567890';

function installedRoute(clock = { now: 0 }) {
  const listeners = [];
  const self = {
    location: new URL(`${ORIGIN}/ngsw-worker.js`),
    crypto: globalThis.crypto,
    addEventListener: (type, listener) => listeners.push({ type, listener }),
  };
  const Date = { now: () => clock.now };
  runInNewContext(PAYMENT_ROUTE_SCRIPT, { self, URL, URLSearchParams, Response, Headers, Date });
  return listeners;
}

function dispatch(listeners, type, event) {
  let stopped = false;
  const dispatched = { ...event, stopImmediatePropagation: () => (stopped = true) };
  for (const listener of listeners.filter((entry) => entry.type === type)) {
    listener.listener(dispatched);
    if (stopped) {
      break;
    }
  }
  return stopped;
}

function fetched(listeners, request) {
  let answer = null;
  const stopped = dispatch(listeners, 'fetch', {
    request,
    respondWith: (response) => (answer = Promise.resolve(response)),
  });
  return { answer, stopped };
}

function reserved(listeners, data) {
  const replies = [];
  const stopped = dispatch(listeners, 'message', {
    data,
    ports: [{ postMessage: (reply) => replies.push(reply) }],
  });
  return { replies: JSON.parse(JSON.stringify(replies)), stopped };
}

function reservationOf(listeners, payment = PAYMENT) {
  const { replies } = reserved(listeners, { type: 'nfnn-payment-file', payment });
  return replies[0].id;
}

function fileAddress(id) {
  return `${ORIGIN}/platba.spayd?${new URLSearchParams({ id })}`;
}

async function assertRefused(response, status) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(
    response.headers.get('content-security-policy'),
    "default-src 'none'; sandbox; frame-ancestors 'none'",
  );
  assert.equal(response.headers.get('content-disposition'), null);
}

describe('Given the payment route of the service worker', () => {
  describe('when the page reserves a valid SPAYD text and opens the payment file of its id', () => {
    it('then the worker answers it itself with the text as a payment file the browser never renders', async () => {
      const route = installedRoute();
      const id = reservationOf(route);
      assert.match(id, /^[0-9a-f-]{36}$/);

      const { answer, stopped } = fetched(route, new Request(fileAddress(id)));

      assert.equal(stopped, true);
      const response = await answer;
      assert.equal(response.status, 200);
      assert.equal(
        response.headers.get('content-type'),
        'application/x-shortpaymentdescriptor; charset=utf-8',
      );
      assert.equal(response.headers.get('content-disposition'), 'inline; filename="platba.spayd"');
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(
        response.headers.get('content-security-policy'),
        "default-src 'none'; sandbox allow-downloads; frame-ancestors 'none'",
      );
      assert.equal(await response.text(), PAYMENT);
    });

    it('and opens it a second time, then the worker refuses it, because an id serves once', async () => {
      const route = installedRoute();
      const id = reservationOf(route);
      await fetched(route, new Request(fileAddress(id))).answer;

      await assertRefused(await fetched(route, new Request(fileAddress(id))).answer, 404);
    });
  });

  describe('when the page opens an id after ten seconds', () => {
    it('then the reservation is gone and the worker refuses it', async () => {
      const clock = { now: 1_000 };
      const route = installedRoute(clock);
      const id = reservationOf(route);

      clock.now += 10_000;

      await assertRefused(await fetched(route, new Request(fileAddress(id))).answer, 404);
    });

    it('and just before, then the payment file is still served', async () => {
      const clock = { now: 1_000 };
      const route = installedRoute(clock);
      const id = reservationOf(route);

      clock.now += 9_999;

      assert.equal((await fetched(route, new Request(fileAddress(id))).answer).status, 200);
    });
  });

  describe('when the page has reserved more payments than the worker keeps', () => {
    it('then the oldest reservations give way and the newest sixteen stay', async () => {
      const route = installedRoute();
      const ids = Array.from({ length: 20 }, () => reservationOf(route));

      for (const id of ids.slice(0, 4)) {
        await assertRefused(await fetched(route, new Request(fileAddress(id))).answer, 404);
      }
      for (const id of ids.slice(4)) {
        assert.equal((await fetched(route, new Request(fileAddress(id))).answer).status, 200);
      }
    });
  });

  describe('when the tab navigates to an id the worker no longer holds, as after a restart of the worker', () => {
    it('then the worker answers 204, so the tab stays on the payment panel', async () => {
      const route = installedRoute();
      const navigation = {
        url: fileAddress('6f1c1e9a-3c1b-4f53-9d55-0d0a9b1f2c11'),
        method: 'GET',
        mode: 'navigate',
      };

      const { answer, stopped } = fetched(route, navigation);

      assert.equal(stopped, true);
      const response = await answer;
      assert.equal(response.status, 204);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('content-disposition'), null);
      assert.equal(await response.text(), '');
    });
  });

  for (const [name, address] of [
    ['no id', `${ORIGIN}/platba.spayd`],
    ['an id nobody reserved', fileAddress('6f1c1e9a-3c1b-4f53-9d55-0d0a9b1f2c11')],
    [
      'a payment written into the address instead of an id',
      `${ORIGIN}/platba.spayd?${new URLSearchParams({ data: PAYMENT })}`,
    ],
  ]) {
    describe(`when something opens the payment file with ${name}`, () => {
      it('then the worker refuses it with 404 as sandboxed plain text', async () => {
        const route = installedRoute();
        reservationOf(route);

        const { answer, stopped } = fetched(route, new Request(address));

        assert.equal(stopped, true);
        await assertRefused(await answer, 404);
      });
    });
  }

  describe('when a reserved id comes with another parameter or twice', () => {
    it('then the worker refuses it', async () => {
      const route = installedRoute();
      const id = reservationOf(route);

      await assertRefused(
        await fetched(route, new Request(`${fileAddress(id)}&data=${encodeURIComponent(PAYMENT)}`))
          .answer,
        404,
      );
      const again = reservationOf(route);
      await assertRefused(
        await fetched(route, new Request(`${fileAddress(again)}&id=${again}`)).answer,
        404,
      );
    });
  });

  for (const [name, payment] of [
    ['an empty text', ''],
    ['a text without the SPAYD header', 'ACC:CZ6520100000005544332217*AM:500.00'],
    ['a header alone', 'SPD*1.0*'],
    ['a line break', `${PAYMENT}\n<script>`],
    [
      'a script that would also parse as JavaScript',
      'SPD*1.0*0;function SPD(){};alert(document.domain)',
    ],
    ['a lower-case letter', `${PAYMENT}*MSG:dar`],
    ['a letter outside ASCII', `${PAYMENT}*MSG:NADĚJE`],
    ['a text over 1 000 characters', `${PAYMENT}*X-INFO:${'A'.repeat(1000)}`],
    ['no text at all', undefined],
  ]) {
    describe(`when the page asks to reserve ${name}`, () => {
      it('then the worker answers without an id', () => {
        const { replies, stopped } = reserved(installedRoute(), {
          type: 'nfnn-payment-file',
          payment,
        });

        assert.equal(stopped, true);
        assert.deepEqual(replies, [{ type: 'nfnn-payment-file', id: null }]);
      });
    });
  }

  describe('when the page sends Angular a message of its own', () => {
    it('then the route leaves it to the Angular worker', () => {
      const { replies, stopped } = reserved(installedRoute(), {
        action: 'CHECK_FOR_UPDATES',
        nonce: 1,
      });

      assert.equal(stopped, false);
      assert.deepEqual(replies, []);
    });
  });

  for (const method of ['HEAD', 'POST']) {
    describe(`when something sends ${method} to the route`, () => {
      it('then the worker answers 405, names GET as the method it allows and keeps the reservation', async () => {
        const route = installedRoute();
        const id = reservationOf(route);
        const init = method === 'POST' ? { method, body: PAYMENT } : { method };

        const response = await fetched(route, new Request(fileAddress(id), init)).answer;

        await assertRefused(response, 405);
        assert.equal(response.headers.get('allow'), 'GET');
        assert.equal((await fetched(route, new Request(fileAddress(id))).answer).status, 200);
      });
    });
  }

  for (const address of [
    `${ORIGIN}/`,
    `${ORIGIN}/platba.spayd/`,
    `${ORIGIN}/platba.spayd.js`,
    `${ORIGIN}/api/platba.spayd`,
    `https://example.com/platba.spayd?id=6f1c1e9a-3c1b-4f53-9d55-0d0a9b1f2c11`,
  ]) {
    describe(`when the page asks for ${address}`, () => {
      it('then the route leaves the request to the Angular worker', () => {
        const { answer, stopped } = fetched(installedRoute(), new Request(address));

        assert.equal(stopped, false);
        assert.equal(answer, null);
      });
    });
  }
});

describe('Given a built Angular service worker', () => {
  let folder;
  const ANGULAR_WORKER = "(() => { self.addEventListener('fetch', () => {}); })();\n";

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'nfnn-sw-wrap-'));
  });

  afterEach(() => {
    rmSync(folder, { recursive: true, force: true });
  });

  describe('when the build wraps it', () => {
    it('then the payment route comes first and the Angular worker follows unchanged', () => {
      const worker = join(folder, 'ngsw-worker.js');
      writeFileSync(worker, ANGULAR_WORKER);

      assert.equal(wrapServiceWorker(worker), true);

      const wrapped = readFileSync(worker, 'utf8');
      assert.ok(wrapped.startsWith(PAYMENT_ROUTE_SCRIPT));
      assert.ok(wrapped.endsWith(ANGULAR_WORKER));
      assert.equal(wrapped.length, PAYMENT_ROUTE_SCRIPT.length + ANGULAR_WORKER.length);
    });
  });

  describe('when the build wraps it a second time', () => {
    it('then the route is not added again', () => {
      const worker = join(folder, 'ngsw-worker.js');
      writeFileSync(worker, ANGULAR_WORKER);
      wrapServiceWorker(worker);

      assert.equal(wrapServiceWorker(worker), false);

      assert.equal(readFileSync(worker, 'utf8'), PAYMENT_ROUTE_SCRIPT + ANGULAR_WORKER);
    });
  });

  describe('when the build output holds the default and the control theme', () => {
    it('then the worker of each is wrapped and a build without a worker is left alone', () => {
      for (const build of ['frontend', 'control-theme', 'development']) {
        mkdirSync(join(folder, build, 'browser'), { recursive: true });
      }
      writeFileSync(join(folder, 'frontend', 'browser', 'ngsw-worker.js'), ANGULAR_WORKER);
      writeFileSync(join(folder, 'control-theme', 'browser', 'ngsw-worker.js'), ANGULAR_WORKER);

      const wrapped = wrapServiceWorkers(folder);

      assert.deepEqual(wrapped.map((file) => file.slice(folder.length + 1)).sort(), [
        join('control-theme', 'browser', 'ngsw-worker.js'),
        join('frontend', 'browser', 'ngsw-worker.js'),
      ]);
      for (const file of wrapped) {
        assert.ok(readFileSync(file, 'utf8').startsWith(PAYMENT_ROUTE_SCRIPT));
      }
    });
  });

  describe('when a build has ngsw.json but its worker lacks the route or is missing', () => {
    it('then the check names it, and a wrapped build or one without a manifest passes', () => {
      for (const build of ['frontend', 'control-theme', 'missing', 'development']) {
        mkdirSync(join(folder, build, 'browser'), { recursive: true });
      }
      for (const build of ['frontend', 'control-theme', 'missing']) {
        writeFileSync(join(folder, build, 'browser', 'ngsw.json'), '{}');
      }
      writeFileSync(join(folder, 'frontend', 'browser', 'ngsw-worker.js'), ANGULAR_WORKER);
      wrapServiceWorker(join(folder, 'frontend', 'browser', 'ngsw-worker.js'));
      writeFileSync(join(folder, 'control-theme', 'browser', 'ngsw-worker.js'), ANGULAR_WORKER);
      writeFileSync(join(folder, 'development', 'browser', 'index.html'), '');

      assert.deepEqual(
        unwrappedServiceWorkers(folder)
          .map((file) => file.slice(folder.length + 1))
          .sort(),
        [
          join('control-theme', 'browser', 'ngsw-worker.js'),
          join('missing', 'browser', 'ngsw-worker.js'),
        ],
      );
    });
  });

  describe('when the wrapped worker starts', () => {
    it('then its route is registered before the Angular listeners', () => {
      const worker = join(folder, 'ngsw-worker.js');
      writeFileSync(worker, ANGULAR_WORKER);
      wrapServiceWorker(worker);
      const listeners = [];
      const self = {
        location: new URL(`${ORIGIN}/ngsw-worker.js`),
        crypto: globalThis.crypto,
        addEventListener: (type, listener) => listeners.push({ type, listener }),
      };

      runInNewContext(readFileSync(worker, 'utf8'), {
        self,
        URL,
        URLSearchParams,
        Response,
        Headers,
        Date,
      });

      assert.deepEqual(
        listeners.map((entry) => entry.type),
        ['message', 'fetch', 'fetch'],
      );
      const { stopped } = fetched(listeners, new Request(fileAddress(reservationOf(listeners))));
      assert.equal(stopped, true);
    });
  });
});
