import type { Page } from '@playwright/test';
import { rowsSha256 } from '../src/app/features/donations/sync/canonical-rows';
import {
  donorWithDonations,
  mockAdministration,
  PETR_DETAIL_PATH,
  rememberedSession,
  serveAdministrationCopyOfAccounts,
} from './baseline/screen-mocks';
import { donations as twoGifts, ISSUING } from './receipt-donations';
import { issuedReceipt } from './receipt-issuing';
import {
  donationItem,
  donor,
  donorSyncOf,
  type DonorSyncMock,
  mockDonorApi,
  mockDonorSync,
  noDonations,
  openDonorSection,
  opensSectionsInSheet,
  showAccountList,
  session,
  signIn,
} from './donor-session';
import { expect, test } from './fixtures';
import { DEVICE_DATABASE, leaked, rawDevice } from './raw-device';

const CANARY_PAYER = 'Zlatohlávek Kanárkový';
const CANARY_IBAN = 'CZ4955000000001041000071';
const PASSWORD = 'correct horse battery';

async function canarySync(): Promise<DonorSyncMock> {
  const rows = [{ payerName: CANARY_PAYER, counterpartyIban: CANARY_IBAN, amountMinor: 50_000 }];
  return {
    summary: { totalAmountMinor: 50_000, count: 1 },
    chunks: [{ id: 'donations:2026', rowsSha256: await rowsSha256(rows), count: 1, rows }],
  };
}

async function openDeviceData(page: Page): Promise<void> {
  await openDonorSection(page, 'Údaje a zabezpečení');
  await expect(page.getByRole('heading', { name: 'Data v tomto zařízení' })).toBeVisible();
}

test.describe('Given a donor who signs in with a password on a device that keeps an encrypted copy', () => {
  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page, { ...noDonations, sync: await canarySync() });
    await page.route('**/api/donors/auth/refresh', (route) => route.fulfill(session(200)));
    await page.route('**/api/donors/auth/logout', (route) => route.fulfill({ status: 204 }));
  });

  test('when the copy is downloaded, then the Argon2id worker wraps it with her password under the production policy and the raw database holds neither her gifts nor her e-mail or password', async ({
    page,
  }) => {
    await signIn(page);
    await openDeviceData(page);

    await expect(page.getByText(/Uloženo v\u00a0zařízení\u00a0· aktualizováno /)).toBeVisible();
    await expect.poll(async () => (await rawDevice(page)).wraps).toEqual(['password', 'session']);
    const raw = await rawDevice(page);
    expect(raw.databases).toContain(DEVICE_DATABASE);
    const cookies = JSON.stringify(await page.context().cookies());
    for (const canary of [CANARY_PAYER, CANARY_IBAN, donor.email, PASSWORD, 'donations:2026']) {
      expect(leaked(`${raw.text}\n${cookies}`, canary), canary).toBe(false);
    }
  });

  test('when she loads the page again, then the same copy opens with its session key, without her password, and only its manifest is asked for to catch it up', async ({
    page,
  }) => {
    await signIn(page);
    await openDeviceData(page);
    await expect(page.getByText(/Uloženo v\u00a0zařízení\u00a0· aktualizováno /)).toBeVisible();
    const before = await rawDevice(page);
    const syncs: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/donations/me/sync')) {
        syncs.push(request.url());
      }
    });

    await page.reload();
    if (opensSectionsInSheet(page)) {
      await openDeviceData(page);
    }

    await expect(page.getByText(/Uloženo v\u00a0zařízení\u00a0· aktualizováno /)).toBeVisible();
    expect((await rawDevice(page)).copyIds).toEqual(before.copyIds);
    expect(before.copyIds).toHaveLength(1);
    await expect.poll(() => syncs.length).toBeGreaterThan(0);
    expect(new Set(syncs.map((url) => new URL(url).pathname))).toEqual(
      new Set(['/api/donations/me/sync']),
    );
  });

  test('when she asks to load the data again, then a status line says they are loaded', async ({
    page,
  }) => {
    await signIn(page);
    await openDeviceData(page);
    await expect(page.getByText(/Uloženo v\u00a0zařízení\u00a0· aktualizováno /)).toBeVisible();

    await page.getByRole('button', { name: 'Načíst data znovu' }).click();

    await expect(
      page.getByRole('status').filter({ hasText: 'Data jsou načtená znovu.' }),
    ).toBeVisible();
  });

  test('when she signs out, then the copy stays on the device with only its password wrap', async ({
    page,
  }) => {
    await signIn(page);
    await openDeviceData(page);
    await expect(page.getByText(/Uloženo v\u00a0zařízení\u00a0· aktualizováno /)).toBeVisible();

    await (await showAccountList(page)).getByRole('button', { name: 'Odhlásit se' }).click();
    await expect(page).toHaveURL(/\/$/);

    await expect.poll(async () => (await rawDevice(page)).wraps).toEqual(['password']);
  });

  test('when she deletes the data on this device, then she is signed out, sent home and the database is gone', async ({
    page,
  }) => {
    await signIn(page);
    await openDeviceData(page);
    await expect(page.getByText(/Uloženo v\u00a0zařízení\u00a0· aktualizováno /)).toBeVisible();

    await page.getByRole('button', { name: 'Smazat data z tohoto zařízení' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(
      dialog.getByRole('heading', { name: 'Smazat data z tohoto zařízení?' }),
    ).toBeVisible();
    await expect(
      dialog.getByRole('heading', { name: 'Smazat data z tohoto zařízení?' }),
    ).toBeFocused();
    await dialog.getByRole('button', { name: 'Smazat data a odhlásit' }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(
      page
        .getByRole('status')
        .getByText('Data z tohoto zařízení jsme smazali a odhlásili jsme vás.'),
    ).toBeVisible();
    await expect.poll(async () => (await rawDevice(page)).databases).not.toContain(DEVICE_DATABASE);
    expect((await rawDevice(page)).marker).toBeNull();
  });
});

test.describe('Given a donor whose copy on this device holds her gifts and her yearly receipt', () => {
  const yearly = issuedReceipt({ year: 2025 }, { ...ISSUING, withArt: true });
  const newGift = donationItem({
    id: '0192f0f1-0000-7000-8000-000000000003',
    receivedAt: '2026-04-02',
    amountMinor: 30000,
  });

  const gifts = (page: Page) =>
    page.locator('.payments-card tbody tr, .payments-card .donation-rows > li');

  test.beforeEach(async ({ page }) => {
    await mockDonorApi(page, {
      ...twoGifts,
      receipts: { ...ISSUING, withArt: true },
      sync: await donorSyncOf(twoGifts.summary, {
        gifts: twoGifts.list.items,
        receipts: [yearly],
      }),
    });
    await page.route('**/api/donors/auth/refresh', (route) => route.fulfill(session(200)));
    await signIn(page);
    await openDeviceData(page);
    await expect(page.getByText(/Uloženo v\u00a0zařízení\u00a0· aktualizováno /)).toBeVisible();
  });

  test('when she opens Moje dary again while the server answers nothing about her gifts, then they show from the copy, and a new gift comes in when the copy catches up, behind Zobrazit 1 nový dar', async ({
    page,
  }) => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(
      (url) => url.pathname === '/api/donations/me' || url.pathname === '/api/donations/me/summary',
      (route) => route.fulfill({ status: 503, body: '' }),
    );
    await mockDonorSync(
      page,
      await donorSyncOf(
        {
          ...twoGifts.summary,
          count: 3,
          totalAmountMinor: 105000,
          lastReceivedAt: '2026-04-02',
          byYear: [{ year: 2026, count: 2, totalAmountMinor: 80000 }, twoGifts.summary.byYear[1]],
        },
        { gifts: [newGift, ...twoGifts.list.items], receipts: [yearly] },
      ),
    );
    await page.route(
      (url) => url.pathname === '/api/donations/me/sync',
      async (route) => {
        await held;
        await route.fallback();
      },
    );

    await page.goto('/darce/dary');

    await expect(gifts(page)).toHaveCount(2);
    release();
    const pill = page.locator('.bank-check-incoming').filter({ hasText: 'Zobrazit 1 nový dar' });
    await expect(pill).toBeVisible();
    await expect(gifts(page)).toHaveCount(2);
    await pill.click();
    await expect(gifts(page)).toHaveCount(3);
    await expect(gifts(page).first()).toContainText('300 Kč');
  });

  test('when the server cannot be reached for her yearly receipt, then it is drawn again from the copy with the signature kept in it', async ({
    page,
  }) => {
    await openDonorSection(page, 'Potvrzení o daru');
    await page.route(
      (url) =>
        url.pathname === '/api/donations/me/receipts' ||
        url.pathname.startsWith('/api/donations/me/receipt-images/'),
      (route) => route.abort('internetdisconnected'),
    );

    const download = page.waitForEvent('download');
    await page.locator('.yearly-pdf').first().click();

    expect((await download).suggestedFilename()).toBe('potvrzeni-o-darech-2025.pdf');
  });
});

const STORED = 'Správa je uložená v tomto zařízení.';

interface FoldTransition {
  readonly property: string;
  readonly running: boolean;
  readonly duration: number;
  readonly easing: string;
}

interface NoticeFrame {
  readonly at: number;
  readonly card: number | null;
  readonly fold: number | null;
  readonly heard: string;
  readonly onHeading: boolean;
  readonly onBody: boolean;
  readonly transitions: readonly FoldTransition[];
}

async function openCardWithFailedCopy(page: Page): Promise<void> {
  await mockDonorApi(page, donorWithDonations);
  await mockAdministration(page);
  await rememberedSession(page);
  await page.goto(PETR_DETAIL_PATH);
  await expect(
    page.locator('.first-download').getByRole('button', { name: 'Uložit znovu' }),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'Shrnutí dárce' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await serveAdministrationCopyOfAccounts(page);
}

async function followNoticeFrames(page: Page): Promise<void> {
  await page.evaluate(() => {
    const frames: unknown[] = [];
    Object.assign(window, { nfnnNoticeFrames: frames });
    const sample = () => {
      const card = document.querySelector('[aria-label="Shrnutí dárce"]');
      const fold = document.querySelector('app-first-download-notice app-fold');
      const live = document.querySelector('.admin-first-download [aria-live="polite"]');
      const active = document.activeElement;
      frames.push({
        at: performance.now(),
        card: card?.getBoundingClientRect().top ?? null,
        fold: fold?.getBoundingClientRect().height ?? null,
        heard: (live?.textContent ?? '').replace(/\s+/g, ' ').trim(),
        onHeading: active?.tagName === 'H1',
        onBody: active === null || active === document.body,
        transitions: (fold?.getAnimations({ subtree: true }) ?? [])
          .filter((animation) => animation instanceof CSSTransition)
          .map((transition) => ({
            property: transition.transitionProperty,
            running: transition.playState === 'running',
            duration: Number(transition.effect?.getComputedTiming().duration ?? 0),
            easing: transition.effect?.getTiming().easing ?? '',
          })),
      });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

async function noticeFrames(page: Page): Promise<NoticeFrame[]> {
  return page.evaluate(
    () => (window as unknown as { nfnnNoticeFrames: NoticeFrame[] }).nfnnNoticeFrames,
  );
}

async function settledNoticeFrames(page: Page): Promise<NoticeFrame[]> {
  await expect
    .poll(async () => {
      const last = (await noticeFrames(page)).slice(-3);
      return last.length === 3 && last.every((frame) => frame.fold === 0);
    })
    .toBe(true);
  return noticeFrames(page);
}

async function durationOf(page: Page, token: string): Promise<number> {
  return page.evaluate((name) => {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value.endsWith('ms') ? parseFloat(value) : parseFloat(value) * 1000;
  }, token);
}

async function easingOf(page: Page, token: string): Promise<string> {
  return page.evaluate((name) => {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const probe = document.createElement('div');
    document.body.append(probe);
    const easing = probe.animate([], { duration: 1, easing: value }).effect!.getTiming().easing!;
    probe.remove();
    return easing;
  }, token);
}

async function expectFoldsOverFrames(
  page: Page,
  frames: readonly NoticeFrame[],
  notice: { readonly height: number },
): Promise<void> {
  const tops = frames.map((frame) => frame.card!);
  const start = tops[0];
  const end = tops.at(-1)!;
  const steps = tops.slice(1).map((top, index) => tops[index] - top);
  expect(Math.min(...steps)).toBeGreaterThanOrEqual(-0.5);
  expect(Math.max(...steps)).toBeLessThanOrEqual(notice.height / 2);
  const between = frames.filter((frame) => frame.card! < start - 0.5 && frame.card! > end + 0.5);
  expect(between.length).toBeGreaterThanOrEqual(2);

  const first = frames.findIndex((frame) => frame.card! < start - 0.5);
  const last = frames.findIndex((frame) => frame.card! <= end + 0.5);
  expect(frames[last].at - frames[first].at).toBeLessThanOrEqual(
    (await durationOf(page, '--duration-base')) + 100,
  );
}

interface FoldSample {
  readonly running: boolean;
  readonly progress: number | null;
  readonly duration: number;
  readonly easing: string;
  readonly startTime: number | null;
  readonly keyframes: readonly string[];
  readonly behavior: string;
  readonly connected: boolean;
  readonly foldDisplay: string;
  readonly noticeDisplay: string;
}

interface FoldTransitionTrace {
  readonly samples: readonly FoldSample[];
  readonly endedAt: number | null;
}

async function followFoldTransition(page: Page): Promise<void> {
  await page.evaluate(() => {
    const trace: { samples: unknown[]; endedAt: number | null } = { samples: [], endedAt: null };
    Object.assign(window, { nfnnFoldTransition: trace });
    document.addEventListener(
      'transitionend',
      (event) => {
        const target = event.target as Element;
        if (
          event.propertyName === 'grid-template-rows' &&
          target.closest('app-first-download-notice app-fold') !== null
        ) {
          trace.endedAt ??= performance.now();
        }
      },
      true,
    );
    const sample = () => {
      const fold = document.querySelector('app-first-download-notice app-fold');
      const transition = fold
        ?.getAnimations({ subtree: true })
        .find(
          (animation): animation is CSSTransition =>
            animation instanceof CSSTransition &&
            animation.transitionProperty === 'grid-template-rows',
        );
      const effect = transition?.effect as KeyframeEffect | undefined;
      const target = effect?.target as HTMLElement | null | undefined;
      if (transition && effect && target) {
        const style = getComputedStyle(target);
        const properties = style.transitionProperty.split(',').map((name) => name.trim());
        const behaviors = style.transitionBehavior.split(',').map((name) => name.trim());
        const notice = document.querySelector('app-first-download-notice .first-download');
        trace.samples.push({
          running: transition.playState === 'running',
          progress: effect.getComputedTiming().progress ?? null,
          duration: Number(effect.getComputedTiming().duration ?? 0),
          easing: effect.getTiming().easing ?? '',
          startTime: transition.startTime === null ? null : Number(transition.startTime),
          keyframes: effect
            .getKeyframes()
            .map((keyframe) => String(keyframe['gridTemplateRows'] ?? '')),
          behavior: behaviors[properties.indexOf('grid-template-rows') % behaviors.length] ?? '',
          connected: target.isConnected && notice !== null && notice.isConnected,
          foldDisplay: style.display,
          noticeDisplay: notice === null ? 'none' : getComputedStyle(notice).display,
        });
      }
      if (trace.endedAt === null) {
        setTimeout(sample, 4);
      }
    };
    sample();
  });
}

async function foldTransitionTrace(page: Page): Promise<FoldTransitionTrace> {
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (window as unknown as { nfnnFoldTransition: FoldTransitionTrace }).nfnnFoldTransition
              .endedAt !== null,
        ),
      { message: 'the grid-template-rows transition of the fold ends' },
    )
    .toBe(true);
  return page.evaluate(
    () => (window as unknown as { nfnnFoldTransition: FoldTransitionTrace }).nfnnFoldTransition,
  );
}

async function expectFoldsByRunningTransition(page: Page): Promise<void> {
  const trace = await foldTransitionTrace(page);
  const duration = await durationOf(page, '--duration-base');
  expect(duration, 'the computed --duration-base').toBeGreaterThan(0);
  const easing = await easingOf(page, '--ease-standard');

  const midway = trace.samples.filter(
    (sample) =>
      sample.running &&
      sample.progress !== null &&
      sample.progress > 0 &&
      sample.progress < 1 &&
      sample.connected &&
      sample.foldDisplay !== 'none' &&
      sample.noticeDisplay !== 'none',
  );
  expect(
    midway.length,
    'a sample of the running grid-template-rows transition between progress 0 and 1, with the notice still rendered',
  ).toBeGreaterThanOrEqual(1);
  const sample = midway[0];
  expect(sample.behavior, 'grid-template-rows does not move as a discrete step').toBe('normal');
  expect(sample.keyframes, 'the transition interpolates from 1fr to 0fr').toEqual(['1fr', '0fr']);
  expect(sample.duration, 'the transition lasts the computed --duration-base').toBe(duration);
  expect(sample.easing, 'the transition eases as motion.expand').toBe(easing);
  expect(sample.startTime, 'the transition has started').not.toBeNull();
  expect(
    trace.endedAt! - sample.startTime!,
    'the transition ends after at least 80 % of --duration-base',
  ).toBeGreaterThanOrEqual(duration * 0.8);
}

async function cardGapUnderHeader(page: Page): Promise<number> {
  const header = (await page.getByRole('banner').boundingBox())!;
  const cardTop = await page
    .getByRole('region', { name: 'Shrnutí dárce' })
    .evaluate((card) => card.getBoundingClientRect().top + window.scrollY);
  return cardTop - (header.y + header.height);
}

function timesSaid(frames: readonly NoticeFrame[], sentence: string): number {
  return frames.filter(
    (frame, index) => frame.heard === sentence && frames[index - 1]?.heard !== sentence,
  ).length;
}

test.describe('Given an administrator on the card of a donor whose device could not store the administration', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('when Uložit znovu stores it, then it folds over the token duration, not in one cut (in Chromium frame by frame, in WebKit by its grid-template-rows transition from 1fr to 0fr, sampled running between progress 0 and 1 while the notice is rendered, never a discrete step), the card rises by exactly the notice and ends at the gap of the page without the notice, and from the start of the fold the focus is on the heading and screen readers hear once that it is stored', async ({
    page,
  }, testInfo) => {
    await openCardWithFailedCopy(page);
    const fold = page.locator('app-first-download-notice app-fold');
    const notice = (await fold.boundingBox())!;
    const card = (await page.getByRole('region', { name: 'Shrnutí dárce' }).boundingBox())!;
    const webkit = testInfo.project.name === 'iphone';
    await followNoticeFrames(page);
    if (webkit) {
      await followFoldTransition(page);
    }

    await page.locator('.first-download').getByRole('button', { name: 'Uložit znovu' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Petr Svoboda' })).toBeFocused();
    await expect(page.locator('.admin-first-download [aria-live="polite"]')).toHaveText(STORED);
    const frames = await settledNoticeFrames(page);
    const tops = frames.map((frame) => frame.card);
    expect(tops.every((top) => top !== null)).toBe(true);
    const start = tops[0]!;
    const end = tops.at(-1)!;
    expect(Math.abs(start - card.y)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(start - end - notice.height)).toBeLessThanOrEqual(0.5);
    expect(notice.height).toBeGreaterThan(40);

    if (webkit) {
      await expectFoldsByRunningTransition(page);
    } else {
      await expectFoldsOverFrames(page, frames, notice);
    }

    const first = frames.findIndex((frame) => frame.card! < start - 0.5);
    expect(frames.slice(first).every((frame) => frame.onHeading)).toBe(true);
    expect(frames[first].heard).toBe(STORED);
    expect(timesSaid(frames, STORED)).toBe(1);
    await expect(page.locator('.first-download').getByText(STORED)).toHaveCount(0);

    const gap = await cardGapUnderHeader(page);
    await page.reload();
    await expect(page.getByRole('region', { name: 'Shrnutí dárce' })).toBeVisible();
    await expect(page.locator('app-first-download-notice app-fold')).toHaveCount(0);
    expect(Math.abs(gap - (await cardGapUnderHeader(page)))).toBeLessThanOrEqual(0.5);
  });
});

test.describe('Given an administrator who asks for less motion, on the card of a donor whose device could not store the administration', () => {
  test.use({ reducedMotion: 'reduce' });

  test('when Uložit znovu stores it, then the notice goes at once or by a short fade without folding its height, the card takes its place, and while it goes the focus stays on the heading, never on the page body, and the sentence stays said once', async ({
    page,
  }) => {
    await openCardWithFailedCopy(page);
    const notice = (await page.locator('app-first-download-notice app-fold').boundingBox())!;
    await followNoticeFrames(page);

    await page.locator('.first-download').getByRole('button', { name: 'Uložit znovu' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Petr Svoboda' })).toBeFocused();
    await expect(page.locator('.admin-first-download [aria-live="polite"]')).toHaveText(STORED);
    const frames = await settledNoticeFrames(page);
    const tops = frames.map((frame) => frame.card!);
    const start = tops[0];
    const end = tops.at(-1)!;
    expect(Math.abs(start - end - notice.height)).toBeLessThanOrEqual(0.5);
    expect(tops.filter((top) => top < start - 0.5 && top > end + 0.5)).toEqual([]);
    expect(frames.filter((frame) => frame.fold! > 0 && frame.fold! < notice.height - 0.5)).toEqual(
      [],
    );
    const reduced = await durationOf(page, '--duration-reduced');
    const moves = frames.flatMap((frame) => frame.transitions).filter((move) => move.running);
    expect(
      moves.filter((move) => move.property === 'grid-template-rows' || move.property === 'height'),
    ).toEqual([]);
    expect(moves.filter((move) => move.property === 'opacity' && move.duration > reduced)).toEqual(
      [],
    );

    expect(frames.filter((frame) => frame.onBody)).toEqual([]);
    const said = frames.findIndex((frame) => frame.heard === STORED);
    expect(said).toBeGreaterThanOrEqual(0);
    const after = frames.slice(said);
    expect(after.every((frame) => frame.heard === STORED)).toBe(true);
    expect(after.every((frame) => frame.onHeading)).toBe(true);
    expect(timesSaid(frames, STORED)).toBe(1);
  });
});
