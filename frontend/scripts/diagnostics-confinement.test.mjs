import assert from 'node:assert/strict';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const frontend = fileURLToPath(new URL('..', import.meta.url));
const eslint = new ESLint({ cwd: frontend });

async function findings(file, text) {
  const [result] = await eslint.lintText(text, { filePath: join(frontend, file) });
  return result.messages.filter((message) => message.ruleId === 'no-restricted-syntax');
}

const DIAGNOSTICS = 'src/app/core/diagnostics/diagnostics.ts';
const SPEC = 'src/app/core/diagnostics/diagnostics.spec.ts';
const ELSEWHERE = 'src/app/core/auth/auth-store.ts';

const READS = {
  "the donor's record": 'export const shown = (store: { donor(): unknown }) => store.donor();\n',
  'the access token':
    'export const shown = (store: { currentAccessToken(): unknown }) => store.currentAccessToken();\n',
  "the donor's e-mail": 'export const shown = (account: { email: string }) => account.email;\n',
  "the donor's name": 'export const shown = (account: { name: string }) => account.name;\n',
  'the open copy': 'export const shown = (vault: { opened(): unknown }) => vault.opened();\n',
  'the contents of a copy':
    'export const shown = (store: { contents(): unknown }) => store.contents();\n',
  'the address with its query or fragment':
    'export const shown = [location.href, location.search, location.hash];\n',
  'the title of the page': 'export const shown = document.title;\n',
  'a cookie': 'export const shown = document.cookie;\n',
  'the referrer': 'export const shown = document.referrer;\n',
  'the client hints':
    'export const shown = (navigator as never as { userAgentData: unknown }).userAgentData;\n',
  'local storage': "export const shown = localStorage.getItem('nfnn.donor-session');\n",
  'an error message': 'export const shown = (error: Error) => [error.message, error.stack];\n',
  'a write to the session storage': "sessionStorage.setItem('k', 'v');\nexport {};\n",
  'a removal from the session storage': "sessionStorage.removeItem('k');\nexport {};\n",
  'a spread of another object': 'export const copied = (state: object) => ({ ...state });\n',
};

describe('Given the diagnostic file, built only from closed values', () => {
  for (const [name, text] of Object.entries(READS)) {
    it(`when its code reaches ${name}, then lint refuses it`, async () => {
      assert.notEqual((await findings(DIAGNOSTICS, text)).length, 0);
    });

    it(`when a spec or code elsewhere reaches ${name}, then this rule does not refuse it`, async () => {
      assert.deepEqual(await findings(SPEC, text), []);
      assert.deepEqual(await findings(ELSEWHERE, text), []);
    });
  }

  it('when its code reads the path of the page and the flags of the session, then lint allows them', async () => {
    assert.deepEqual(
      await findings(
        DIAGNOSTICS,
        'export const shown = (auth: { signedIn(): boolean; isAdmin(): boolean }) => [location.pathname, auth.signedIn(), auth.isAdmin()];\n',
      ),
      [],
    );
  });
});
