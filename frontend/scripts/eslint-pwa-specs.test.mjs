import assert from 'node:assert/strict';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const frontend = fileURLToPath(new URL('..', import.meta.url));
const eslint = new ESLint({ cwd: frontend });

const RESTRICTIONS = ['no-restricted-imports', 'no-restricted-syntax'];

async function refusals(file, text) {
  const [result] = await eslint.lintText(text, { filePath: join(frontend, file) });
  return result.messages.filter((message) => RESTRICTIONS.includes(message.ruleId));
}

const spec = (imports, body = '') =>
  `${imports}\ntest('when …, then …', async ({ page, context }) => {\n  expect(page).toBeDefined();\n  expect(context).toBeDefined();\n${body}});\n`;

describe('Given a spec of the web app tests', () => {
  it('when it imports pwaTest and expect from the pwa fixtures and routes on the context, then it is allowed', async () => {
    assert.deepEqual(
      await refusals(
        'e2e/pwa/planted.spec.ts',
        spec(
          "import { expect, pwaTest as test } from './pwa-fixtures';",
          "  await context.route('**/api/x', (route) => route.abort());\n",
        ),
      ),
      [],
    );
  });

  it("when it imports test from Playwright, then it is refused, since a page's routes miss the worker's requests", async () => {
    assert.notDeepEqual(
      await refusals(
        'e2e/pwa/planted.spec.ts',
        spec("import { expect, test } from '@playwright/test';"),
      ),
      [],
    );
  });

  it('when it imports test from the fixtures of the other projects, then it is refused', async () => {
    assert.notDeepEqual(
      await refusals(
        'e2e/pwa/planted.spec.ts',
        spec("import { expect, test } from '../fixtures';"),
      ),
      [],
    );
  });

  it('when it routes on the page, then it is refused', async () => {
    assert.notDeepEqual(
      await refusals(
        'e2e/pwa/planted.spec.ts',
        spec(
          "import { expect, pwaTest as test } from './pwa-fixtures';",
          "  await page.route('**/api/x', (route) => route.abort());\n",
        ),
      ),
      [],
    );
  });
});

describe('Given a spec of the other e2e projects', () => {
  it('when it routes on the page, then it is allowed', async () => {
    assert.deepEqual(
      await refusals(
        'e2e/planted.spec.ts',
        spec(
          "import { expect, test } from './fixtures';",
          "  await page.route('**/api/x', (route) => route.abort());\n",
        ),
      ),
      [],
    );
  });
});
