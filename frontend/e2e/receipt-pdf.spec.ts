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
  test('when the data takes a while, then a progress line names each step, the focused button keeps the focus, and the PDF drawn in the browser is saved and holds the receipt', async ({
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

    await yearlyButton(page).focus();
    await page.keyboard.press('Enter');

    await expect(yearlyLine(page)).toHaveText('Připravujeme údaje potvrzení…');
    await expect(page.locator('.year-row progress')).toHaveAttribute('value', '1');
    await expect(yearlyButton(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(yearlyButton(page)).toBeFocused();

    const download = page.waitForEvent('download');
    release();
    const saved = await download;

    expect(saved.suggestedFilename()).toBe('potvrzeni-o-darech-2025.pdf');
    await expect(yearlyLine(page)).toHaveText(
      'Potvrzení potvrzeni-o-darech-2025.pdf je stažené. Najdete ho ve stažených souborech.',
    );
    await expect(page.locator('.year-row progress')).toHaveCount(0);
    await expect(yearlyButton(page)).toBeFocused();
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

  test('when the drawing tools are still missing after that one reload, then the page says they could not be loaded and what to try instead of reloading again', async ({
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
      'Nástroje pro PDF se nepodařilo načíst ani po obnovení stránky. Zkontrolujte prosím připojení nebo blokování skriptů, zkuste jiný prohlížeč, nebo nám napište na info@nfnn.cz.',
    );
    expect(documents).toEqual(['/darce/potvrzeni?stahnout=rok-2025']);
    await expect(page).toHaveURL(/\/darce\/potvrzeni$/);
    await expect(yearlyButton(page)).toBeEnabled();
  });
});

test.describe('Given a signed-in donor on an iPhone, whose browser shares files', () => {
  test('when the receipt is drawn, then the same button, now Otevřít potvrzení and focused, hands the PDF to the share sheet without issuing it again', async ({
    page,
  }) => {
    await pretendIphoneThatShares(page);
    await mockDonorApi(page, { ...donations, receipts: ISSUING });
    await openReceiptsAfterSignIn(page);
    let downloads = 0;
    let issuing = 0;
    page.on('download', () => downloads++);
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === RECEIPT_ISSUING_URL) {
        issuing++;
      }
    });

    await yearlyButton(page).click();

    await expect(yearlyLine(page)).toHaveText(
      'Potvrzení potvrzeni-o-darech-2025.pdf je připravené. Otevřete ho tlačítkem Otevřít potvrzení.',
    );
    await expect(yearlyButton(page)).toHaveText('Otevřít potvrzení za rok 2025 (PDF)');
    await expect(yearlyButton(page)).toBeFocused();
    await yearlyButton(page).click();

    await expect(yearlyLine(page)).toHaveText(
      'Potvrzení potvrzeni-o-darech-2025.pdf jste předali z nabídky sdílení.',
    );
    expect(await sharedFiles(page)).toEqual(['potvrzeni-o-darech-2025.pdf application/pdf']);
    expect(downloads).toBe(0);
    expect(issuing).toBe(1);
    await expect(yearlyButton(page)).toHaveText('Stáhnout potvrzení za rok 2025 (PDF)');
  });
});

interface DrawingTiming {
  posted: number;
  done: number;
}

async function timeWorkerDrawings(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const timings: DrawingTiming[] = [];
    (window as unknown as { receiptDrawings: DrawingTiming[] }).receiptDrawings = timings;
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (
      this: Worker,
      ...message: Parameters<Worker['postMessage']>
    ) {
      const timing = { posted: performance.now(), done: 0 };
      timings.push(timing);
      this.addEventListener('message', (event: MessageEvent<{ kind?: string }>) => {
        if (event.data?.kind === 'done') {
          timing.done = performance.now();
        }
      });
      return post.apply(this, message);
    } as Worker['postMessage'];
  });
}

async function lastDrawingMs(page: Page): Promise<number> {
  return page.evaluate(() => {
    const drawings = (window as unknown as { receiptDrawings: DrawingTiming[] }).receiptDrawings;
    const timing = drawings.at(-1);
    return timing === undefined || timing.done === 0
      ? Number.NaN
      : Math.round(timing.done - timing.posted);
  });
}

const SLOWER_COMPUTER = 4;
const WARM_DRAWINGS = 5;
const WARM_MEDIAN_BOUND_MS = 1000;

function median(values: readonly number[]): number {
  const sorted = [...values].sort((first, second) => first - second);
  return sorted[Math.floor(sorted.length / 2)];
}

test.describe('Given a donor whose year holds 120 gifts', () => {
  test('when they download its receipt again and again, then the median drawing in the worker stays within a second at full speed, and the cold and warm times are reported', async ({
    page,
  }) => {
    await timeWorkerDrawings(page);
    await mockDonorApi(page, { ...donations, receipts: { ...ISSUING, yearlyCase: YEARLY_120 } });
    await openReceiptsAfterSignIn(page);
    const draw = async (): Promise<{ pdf: Uint8Array; milliseconds: number }> => {
      const [saved] = await Promise.all([
        page.waitForEvent('download'),
        yearlyButton(page).click(),
      ]);
      await expect(yearlyButton(page)).toBeEnabled();
      return { pdf: await savedPdf(saved), milliseconds: await lastDrawingMs(page) };
    };

    const cold = await draw();
    const warm: number[] = [];
    for (let run = 0; run < WARM_DRAWINGS; run++) {
      warm.push((await draw()).milliseconds);
    }
    const warmMedian = median(warm);

    test.info().annotations.push(
      {
        type: 'cold drawing in the worker at CPU 1×',
        description: `${cold.milliseconds} ms; ×${SLOWER_COMPUTER} = ${cold.milliseconds * SLOWER_COMPUTER} ms`,
      },
      {
        type: `warm drawings in the worker at CPU 1× (${WARM_DRAWINGS} runs)`,
        description: `${warm.join(' ms, ')} ms; median ${warmMedian} ms, ×${SLOWER_COMPUTER} = ${warmMedian * SLOWER_COMPUTER} ms`,
      },
    );
    expect((await readPdf(cold.pdf)).pages).toHaveLength(5);
    expect([cold.milliseconds, ...warm].every(Number.isFinite)).toBe(true);
    expect(warmMedian).toBeLessThanOrEqual(WARM_MEDIAN_BOUND_MS);
  });
});
