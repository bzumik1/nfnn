import assert from 'node:assert/strict';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const frontend = fileURLToPath(new URL('..', import.meta.url));
const eslint = new ESLint({ cwd: frontend });

const optingOut = (from) =>
  `import { HttpContext } from '@angular/common/http';\nimport { WITHOUT_ACCESS_TOKEN } from '${from}';\nexport const context = new HttpContext().set(WITHOUT_ACCESS_TOKEN, true);\n`;

async function refusals(file, text) {
  const [result] = await eslint.lintText(text, { filePath: join(frontend, file) });
  return result.messages.filter((message) => message.ruleId === 'no-restricted-imports');
}

describe('Given the opt-out of the access token', () => {
  it('when the API service of the public payment details imports it, then it is allowed', async () => {
    assert.deepEqual(
      await refusals(
        'src/app/features/donations/payment-details-api.ts',
        optingOut('../../core/auth/auth-interceptor'),
      ),
      [],
    );
  });

  it('when another API service imports it, then it is refused, since an endpoint that needs the token answers 401 without it', async () => {
    assert.notDeepEqual(
      await refusals(
        'src/app/features/donations/donations-api.ts',
        optingOut('../../core/auth/auth-interceptor'),
      ),
      [],
    );
  });

  it('when a component imports it, then it is refused', async () => {
    assert.notDeepEqual(
      await refusals(
        'src/app/features/content/home/home.ts',
        optingOut('../../../core/auth/auth-interceptor'),
      ),
      [],
    );
  });

  it('when the interceptor spec imports it, then it is allowed', async () => {
    assert.deepEqual(
      await refusals('src/app/core/auth/auth-interceptor.spec.ts', optingOut('./auth-interceptor')),
      [],
    );
  });

  it('when another file imports only the interceptor itself, then it is allowed', async () => {
    assert.deepEqual(
      await refusals(
        'src/app/app.config.ts',
        "import { authInterceptor } from './core/auth/auth-interceptor';\nexport const interceptors = [authInterceptor];\n",
      ),
      [],
    );
  });
});
