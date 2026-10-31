import type { Download, Page, Route } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { readPdf } from '../src/app/features/donations/receipt-pdf/testing/pdf-reader';
import { mockDonorApi } from './donor-session';
import { expect, test } from './fixtures';
import {
  donations,
  ISSUING,
  openReceiptsAfterSignIn,
  pretendIphoneThatShares,
  sharedFiles,
  yearlyButton,
  yearlyLine,
} from './receipt-donations';
import { answerReceiptIssuing, RECEIPT_ISSUING_URL, YEARLY_120 } from './receipt-issuing';

const WORKER = /^\/worker-[A-Za-z0-9_-]{8}\.js$/;
async function savedPdf(download: Download): Promise<Uint8Array> {
  return new Uint8Array(await readFile(await download.path()));
}

function documentsLoaded(page: Page): string[] {
  const documents: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'document') {
      const url = new URL(request.url());
      documents.push(url.pathname + url.search);
    }
  });
  return documents;
}

test.describe('Given a signed-in donor who downloads a receipt', () => {
  test('when the data takes a while, then a progress line names each step, and the PDF drawn in the browser is saved and holds the receipt', async ({
    page,
  }) => {
    await mockDonorApi(page, donations);
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(
      (url) => url.pathname === RECEIPT_ISSUING_URL,
      async (route: Route) => {
        await held;
        await answerReceiptIssuing(route, ISSUING);
      },
    );
    await openReceiptsAfterSignIn(page);

    await yearlyButton(page).click();

    await expect(yearlyLine(page)).toHaveText('Připravujeme údaje potvrzení…');
    await expect(page.locator('.year-row progress')).toHaveAttribute('value', '1');
    await expect(yearlyButton(page)).toBeDisabled();

    const download = page.waitForEvent('download');
    release();
    const saved = await download;

    expect(saved.suggestedFilename()).toBe('potvrzeni-o-darech-2025.pdf');
    await expect(yearlyLine(page)).toHaveText(
      'Potvrzení potvrzeni-o-darech-2025.pdf je stažené. Najdete ho ve stažených souborech.',
    );
    await expect(page.locator('.year-row progress')).toHaveCount(0);
    const pdf = await readPdf(await savedPdf(saved));
    expect(pdf.pages).toHaveLength(1);
    expect(pdf.pages[0].text).toContain('2026-000001');
    expect(pdf.pages[0].links.map((link) => link.url)).toEqual([
      expect.stringMatching(/^https:\/\/nfnn\.cz\/overit#/),
    ]);
    expect(pdf.roles).toEqual(expect.arrayContaining(['Document', 'H1', 'Figure', 'Link']));
  });

  test('when the drawing tools of the page are gone after a deploy, then the page loads once more and resumes the same download', async ({
    page,
  }) => {
    await mockDonorApi(page, { ...donations, receipts: ISSUING });
    let workerGone = true;
    await page.route(
      (url) => WORKER.test(url.pathname),
      (route) => (workerGone ? route.fulfill({ status: 404, body: '' }) : route.continue()),
    );
    await openReceiptsAfterSignIn(page);
    const documents = documentsLoaded(page);
    page.once('framenavigated', () => (workerGone = false));

    const [saved] = await Promise.all([page.waitForEvent('download'), yearlyButton(page).click()]);

    expect(documents).toEqual(['/darce/potvrzeni?stahnout=rok-2025']);
    expect(saved.suggestedFilename()).toBe('potvrzeni-o-darech-2025.pdf');
    await expect(page).toHaveURL(/\/darce\/potvrzeni$/);
    await expect(yearlyLine(page)).toHaveText(
      'Potvrzení potvrzeni-o-darech-2025.pdf je stažené. Najdete ho ve stažených souborech.',
    );
  });

  test('when the drawing tools are still missing after that one reload, then the page asks to reload it instead of trying again', async ({
    page,
  }) => {
    await mockDonorApi(page, { ...donations, receipts: ISSUING });
    await page.route(
      (url) => WORKER.test(url.pathname),
      (route) => route.fulfill({ status: 404, body: '' }),
    );
    await openReceiptsAfterSignIn(page);
    const documents = documentsLoaded(page);

    await yearlyButton(page).click();

    await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveText(
      'Web se mezitím aktualizoval. Obnovte prosím stránku a stáhněte potvrzení znovu.',
    );
    expect(documents).toEqual(['/darce/potvrzeni?stahnout=rok-2025']);
    await expect(page).toHaveURL(/\/darce\/potvrzeni$/);
    await expect(yearlyButton(page)).toBeEnabled();
  });
});

test.describe('Given a signed-in donor on an iPhone, whose browser shares files', () => {
  test('when the receipt is drawn, then a second tap on Otevřít potvrzení hands the PDF to the share sheet', async ({
    page,
  }) => {
    await pretendIphoneThatShares(page);
    await mockDonorApi(page, { ...donations, receipts: ISSUING });
    await openReceiptsAfterSignIn(page);
    let downloads = 0;
    page.on('download', () => downloads++);

    await yearlyButton(page).click();

    await expect(yearlyLine(page)).toHaveText(
      'Potvrzení potvrzeni-o-darech-2025.pdf je připravené. Otevřete ho tlačítkem Otevřít potvrzení.',
    );
    await page.getByRole('button', { name: 'Otevřít potvrzení' }).click();

    await expect(yearlyLine(page)).toHaveText(
      'Potvrzení potvrzeni-o-darech-2025.pdf je otevřené. Uložte ho nebo ho pošlete, kam potřebujete.',
    );
    expect(await sharedFiles(page)).toEqual(['potvrzeni-o-darech-2025.pdf application/pdf']);
    expect(downloads).toBe(0);
  });
});

test.describe('Given a donor whose year holds 120 gifts, on a computer four times slower', () => {
  test('when they download its receipt, then the browser draws all its pages within two seconds of the data arriving', async ({
    page,
  }) => {
    await mockDonorApi(page, { ...donations, receipts: { ...ISSUING, yearlyCase: YEARLY_120 } });
    await openReceiptsAfterSignIn(page);
    await page.evaluate(() => fetch('/receipt-fonts/body.ttf'));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const answered = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith(RECEIPT_ISSUING_URL),
    );

    const [saved] = await Promise.all([page.waitForEvent('download'), yearlyButton(page).click()]);
    const drawnAt = Date.now();
    await answered;
    const timing = await page.evaluate(() => {
      const issuing = performance
        .getEntriesByType('resource')
        .filter((entry) => entry.name.endsWith('/api/donations/me/receipts'))
        .at(-1);
      return { answeredAt: performance.timeOrigin + (issuing?.responseEnd ?? 0) };
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

    const pdf = await readPdf(await savedPdf(saved));
    const milliseconds = drawnAt - timing.answeredAt;
    test
      .info()
      .annotations.push({ type: 'drawing time at CPU 4×', description: `${milliseconds} ms` });
    expect(pdf.pages.length).toBeGreaterThan(2);
    expect(milliseconds).toBeLessThanOrEqual(2000);
  });
});
