import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { runInNewContext } from 'node:vm';
import {
  PAYMENT_ROUTE_SCRIPT,
  wrapServiceWorker,
  wrapServiceWorkers,
} from './wrap-service-worker.mjs';

const ORIGIN = 'https://nfnn.cz';
const PAYMENT =
  'SPD*1.0*ACC:CZ6520100000005544332217*AM:500.00*CC:CZK*MSG:DAR NOVA NADEJE*X-VS:1234567890';

function installedRoute() {
  const listeners = [];
  const self = {
    location: new URL(`${ORIGIN}/ngsw-worker.js`),
    addEventListener: (type, listener) => listeners.push({ type, listener }),
  };
  runInNewContext(PAYMENT_ROUTE_SCRIPT, { self, URL, URLSearchParams, Response, Headers });
  return listeners;
}

function dispatch(listeners, request) {
  let answer = null;
  let stopped = false;
  const event = {
    request,
    respondWith: (response) => {
      answer = Promise.resolve(response);
    },
    stopImmediatePropagation: () => {
      stopped = true;
    },
  };
  for (const { type, listener } of listeners) {
    if (type === 'fetch') {
      listener(event);
      if (stopped) {
        break;
      }
    }
  }
  return { answer, stopped };
}

function routeAddress(data) {
  return `${ORIGIN}/platba.spayd?${new URLSearchParams({ data })}`;
}

describe('Given the payment route of the service worker', () => {
  describe('when the page opens the payment file of a valid SPAYD text', () => {
    it('then the worker answers it itself with the text as a payment file the browser never renders', async () => {
      const { answer, stopped } = dispatch(installedRoute(), new Request(routeAddress(PAYMENT)));

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
        "default-src 'none'; sandbox allow-downloads",
      );
      assert.equal(await response.text(), PAYMENT);
    });
  });

  describe('when the page asks whether the route is there', () => {
    it('then a HEAD request is answered with the payment media type and no body', async () => {
      const { answer, stopped } = dispatch(
        installedRoute(),
        new Request(`${ORIGIN}/platba.spayd`, { method: 'HEAD' }),
      );

      assert.equal(stopped, true);
      const response = await answer;
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /^application\/x-shortpaymentdescriptor/);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(await response.text(), '');
    });
  });

  for (const [name, address] of [
    ['no text', `${ORIGIN}/platba.spayd`],
    ['an empty text', routeAddress('')],
    ['a text without the SPAYD header', routeAddress('ACC:CZ6520100000005544332217*AM:500.00')],
    ['a header alone', routeAddress('SPD*1.0*')],
    ['a line break', routeAddress(`${PAYMENT}\n<script>`)],
    ['a letter outside ASCII', routeAddress(`${PAYMENT}*MSG:NADĚJE`)],
    ['a text over 1 000 characters', routeAddress(`${PAYMENT}*X-INFO:${'A'.repeat(1000)}`)],
    ['two texts', `${routeAddress(PAYMENT)}&data=${encodeURIComponent(PAYMENT)}`],
  ]) {
    describe(`when the page opens the payment file of ${name}`, () => {
      it('then the worker refuses it with 400 as plain text and writes no payment file', async () => {
        const { answer, stopped } = dispatch(installedRoute(), new Request(address));

        assert.equal(stopped, true);
        const response = await answer;
        assert.equal(response.status, 400);
        assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8');
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.equal(response.headers.get('content-disposition'), null);
      });
    });
  }

  describe('when something posts to the route', () => {
    it('then the worker answers 405 and names the methods it allows', async () => {
      const { answer, stopped } = dispatch(
        installedRoute(),
        new Request(routeAddress(PAYMENT), { method: 'POST', body: PAYMENT }),
      );

      assert.equal(stopped, true);
      const response = await answer;
      assert.equal(response.status, 405);
      assert.equal(response.headers.get('allow'), 'GET, HEAD');
    });
  });

  for (const address of [
    `${ORIGIN}/`,
    `${ORIGIN}/platba.spayd/`,
    `${ORIGIN}/platba.spayd.js`,
    `${ORIGIN}/api/platba.spayd`,
    `https://example.com/platba.spayd?data=${encodeURIComponent(PAYMENT)}`,
  ]) {
    describe(`when the page asks for ${address}`, () => {
      it('then the route leaves the request to the Angular worker', () => {
        const { answer, stopped } = dispatch(installedRoute(), new Request(address));

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

  describe('when the wrapped worker starts', () => {
    it('then its route is registered before the Angular listener', () => {
      const worker = join(folder, 'ngsw-worker.js');
      writeFileSync(worker, ANGULAR_WORKER);
      wrapServiceWorker(worker);
      const types = [];
      const self = {
        location: new URL(`${ORIGIN}/ngsw-worker.js`),
        addEventListener: (type, listener) => types.push({ type, listener }),
      };

      runInNewContext(readFileSync(worker, 'utf8'), {
        self,
        URL,
        URLSearchParams,
        Response,
        Headers,
      });

      assert.equal(types.length, 2);
      const { stopped } = dispatch(types, new Request(routeAddress(PAYMENT)));
      assert.equal(stopped, true);
    });
  });
});
