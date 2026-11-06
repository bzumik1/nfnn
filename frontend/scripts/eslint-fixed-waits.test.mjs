import assert from 'node:assert/strict';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const frontend = fileURLToPath(new URL('..', import.meta.url));
const eslint = new ESLint({ cwd: frontend });

async function refusals(file, text) {
  const [result] = await eslint.lintText(text, { filePath: join(frontend, file) });
  return result.messages
    .filter((message) => message.ruleId === 'no-restricted-syntax')
    .map((message) => message.message);
}

const FIXED_WAIT = /waitForTimeout/;

const spec = (imports, body) =>
  `${imports}\ntest('when …, then …', async ({ page, context }) => {\n  expect(context).toBeDefined();\n${body}});\n`;

const fixedWait = (target) => `  await ${target}.waitForTimeout(300);\n`;

describe('Given an e2e spec', () => {
  it('when it waits a fixed time on the page, then it is refused', async () => {
    const found = await refusals(
      'e2e/planted.spec.ts',
      spec("import { expect, test } from './fixtures';", fixedWait('page')),
    );

    assert.equal(found.length, 1);
    assert.match(found[0], FIXED_WAIT);
  });

  it('when it waits a fixed time on another frame or page, then it is refused', async () => {
    const found = await refusals(
      'e2e/planted.spec.ts',
      spec(
        "import { expect, test } from './fixtures';",
        `  const popup = await context.newPage();\n${fixedWait('popup.mainFrame()')}`,
      ),
    );

    assert.equal(found.length, 1);
  });

  it('when a directive tries to switch the rule off, then the fixed wait is still refused', async () => {
    const found = await refusals(
      'e2e/planted.spec.ts',
      spec(
        "import { expect, test } from './fixtures';",
        `  // eslint-disable-next-line no-restricted-syntax -- planted\n${fixedWait('page')}`,
      ),
    );

    assert.equal(found.length, 1);
  });

  it('when it waits on observable state, then it is allowed', async () => {
    assert.deepEqual(
      await refusals(
        'e2e/planted.spec.ts',
        spec(
          "import { expect, test } from './fixtures';",
          "  await expect(page.getByRole('dialog')).toHaveCount(0);\n",
        ),
      ),
      [],
    );
  });
});

describe('Given an e2e helper that is not a spec', () => {
  it('when it waits a fixed time, then it is refused', async () => {
    const found = await refusals(
      'e2e/planted-helper.ts',
      "import type { Page } from '@playwright/test';\nexport async function pause(page: Page): Promise<void> {\n  await page.waitForTimeout(100);\n}\n",
    );

    assert.equal(found.length, 1);
  });

  it('when it is the fixed waits file, then its wait is allowed', async () => {
    assert.deepEqual(
      await refusals(
        'e2e/fixed-waits.ts',
        "import type { Page } from '@playwright/test';\nexport async function waitWhileNothingMayHappen(page: Page, ms: number): Promise<void> {\n  await page.waitForTimeout(ms);\n}\n",
      ),
      [],
    );
  });
});

describe('Given a spec of the web app tests', () => {
  it('when it waits a fixed time and routes on the page, then both are refused', async () => {
    const found = await refusals(
      'e2e/pwa/planted.spec.ts',
      spec(
        "import { expect, pwaTest as test } from './pwa-fixtures';",
        `${fixedWait('page')}  await page.route('**/api/x', (route) => route.abort());\n`,
      ),
    );

    assert.equal(found.length, 2);
    assert.equal(found.filter((message) => FIXED_WAIT.test(message)).length, 1);
  });
});

describe('Given a spec of the phones and tablets', () => {
  it('when it waits a fixed time, then it is refused', async () => {
    const found = await refusals(
      'e2e/devices/planted.spec.ts',
      spec("import { expect, test } from '../fixtures';", fixedWait('page')),
    );

    assert.equal(found.length, 1);
  });
});
