import AxeBuilder from '@axe-core/playwright';
import { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './fixtures';

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const FALLBACK_PATH = '/vypadek-ukazka';

function workerConstant(source: string, name: string): string {
  const match = new RegExp(`^const ${name} = (".*");$`, 'm').exec(source);
  if (!match) {
    throw new Error(`the fallback Worker defines no ${name}`);
  }
  return JSON.parse(match[1]) as string;
}

const workerSource = readFileSync(
  join(__dirname, '..', '..', 'deploy', 'cloudflare', 'nfnn-fallback-worker.mjs'),
  'utf8',
);
const fallbackPage = workerConstant(workerSource, 'FALLBACK_PAGE');
const fallbackPolicy = workerConstant(workerSource, 'FALLBACK_POLICY');

async function openFallbackPage(page: Page): Promise<string[]> {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.addInitScript(() => {
    const seen: string[] = [];
    Object.assign(window, { policyViolations: seen });
    document.addEventListener('securitypolicyviolation', (event) =>
      seen.push(`${event.violatedDirective} ${event.blockedURI}`),
    );
  });
  await page.route(`**${FALLBACK_PATH}`, (route) =>
    route.fulfill({
      status: 503,
      contentType: 'text/html; charset=utf-8',
      headers: { 'content-security-policy': fallbackPolicy },
      body: fallbackPage,
    }),
  );
  await page.goto(FALLBACK_PATH);
  return requests;
}

async function sidewaysOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.describe('Given a visitor whose server is down and who meets the fallback page', () => {
  test('when it opens, then it asks for nothing more and its own policy blocks nothing on it', async ({
    page,
  }) => {
    const requests = await openFallbackPage(page);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Web je dočasně nedostupný');
    expect(requests).toEqual([new URL(FALLBACK_PATH, page.url()).href]);
    expect(
      await page.evaluate(
        () => (window as unknown as { policyViolations: string[] }).policyViolations,
      ),
    ).toEqual([]);
  });

  test('when it opens, then nothing on it breaks WCAG 2.2 AA', async ({ page }) => {
    await openFallbackPage(page);

    const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
    expect(
      results.violations.flatMap((violation) =>
        violation.nodes.map((node) => `${violation.id}: ${node.target.join(' ')}`),
      ),
    ).toEqual([]);
  });

  test('when it opens, then it shows how to donate and where to write', async ({ page }) => {
    await openFallbackPage(page);

    await expect(
      page.getByRole('img', { name: /QR kód platby na účet .* bez částky/ }),
    ).toBeVisible();
    await expect(page.getByText('Číslo účtu')).toBeVisible();
    await expect(page.getByText('IBAN')).toBeVisible();
    await expect(page.getByRole('link', { name: 'info@nfnn.cz' })).toHaveAttribute(
      'href',
      'mailto:info@nfnn.cz',
    );
    await expect(page.getByRole('link', { name: 'Zkusit znovu' })).toHaveAttribute('href', '/');
  });

  for (const width of [320, 390]) {
    test(`when it opens on a ${width} px screen, then nothing scrolls sideways`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await openFallbackPage(page);

      expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
    });
  }

  test('when the text is enlarged to 200 % on a phone, then nothing scrolls sideways', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await openFallbackPage(page);
    await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));

    expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
  });
});
