import assert from 'node:assert/strict';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const frontend = fileURLToPath(new URL('..', import.meta.url));
const eslint = new ESLint({ cwd: frontend });
const STORAGE_RULES = ['no-restricted-globals', 'no-restricted-properties'];

async function storageFindings(file, text) {
  const [result] = await eslint.lintText(text, { filePath: join(frontend, file) });
  return result.messages.filter((message) => STORAGE_RULES.includes(message.ruleId));
}

const CORE = 'src/app/core/device/crypto/copy-keys.ts';
const SPEC = 'src/app/core/device/crypto/copy-keys.spec.ts';
const ELSEWHERE = 'src/app/core/device/device-store.ts';

const WRITES = {
  IndexedDB: "export const opened = indexedDB.open('nfnn');\n",
  'IndexedDB through window': "export const opened = window.indexedDB.open('nfnn');\n",
  'IndexedDB through globalThis': "export const opened = globalThis.indexedDB.open('nfnn');\n",
  'IndexedDB through self': "export const opened = self.indexedDB.open('nfnn');\n",
  localStorage: "localStorage.setItem('k', 'v');\nexport {};\n",
  'localStorage by assignment': "window.localStorage['k'] = 'v';\nexport {};\n",
  sessionStorage: "sessionStorage.setItem('k', 'v');\nexport {};\n",
  'the Cache API': "export const cache = caches.open('nfnn');\n",
  'a cookie': "document.cookie = 'k=v';\nexport {};\n",
  'origin private files': 'export const root = navigator.storage.getDirectory();\n',
  'the credential store': 'export const stored = navigator.credentials.store(null as never);\n',
  'origin private files through window':
    'export const root = window.navigator.storage.getDirectory();\n',
  'a cookie through window': "window.document.cookie = 'k=v';\nexport {};\n",
  'a cookie through globalThis': "globalThis.document.cookie = 'k=v';\nexport {};\n",
  'the cookie store': "export const set = cookieStore.set('k', 'v');\n",
  'the cookie store through self': "export const set = self.cookieStore.set('k', 'v');\n",
};

describe('Given the device crypto core, which stores nothing itself', () => {
  for (const [name, text] of Object.entries(WRITES)) {
    it(`when its code reaches ${name}, then lint refuses it`, async () => {
      assert.notEqual((await storageFindings(CORE, text)).length, 0);
    });

    it(`when a spec or code outside the core reaches ${name}, then this rule does not refuse it`, async () => {
      assert.deepEqual(await storageFindings(SPEC, text), []);
      assert.deepEqual(await storageFindings(ELSEWHERE, text), []);
    });
  }

  it('when its code uses WebCrypto and a worker, then lint does not refuse them', async () => {
    assert.deepEqual(
      await storageFindings(
        CORE,
        "export const bytes = crypto.getRandomValues(new Uint8Array(4));\nexport const worker = new Worker(new URL('./argon2.worker', import.meta.url));\n",
      ),
      [],
    );
  });
});
