import type { Locator, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { viewBand, type ViewBand } from '../src/app/core/layout/focus-in-view';
import { stepBack } from './app-history';
import {
  administrationCopyGift,
  administrator,
  mockDonorApi,
  serveAdministrationCopy,
  session,
  whenAdministrationCopied,
} from './donor-session';
import { expect, test } from './fixtures';

const WIDTH = 390;
const HEIGHT = 700;
const FINGER_Y = 420;
const EDGE = 20;
const FLICK_REST_MS = 100;
const SHEET_TOP_GAP_PX = 80;
const BAND = { y: 4, height: 20 };
const SAME_COLOUR = 3;
const SCROLLED_BY_PX = 160;
const STEP_ENDS_WITHIN_MS = 6000;
const FIRST_SHOWN_AT_MOST = 0.25;
const BUSY_AS_ON_THE_PHONE_MS = 140;
const DRAWN_AS_LATE_AS_ON_THE_PHONE_MS = 140;
const LONG_AS_ON_THE_PHONE_MS = 80;
const FIRST_MOVED_FRAME_AT_MOST = 0.2;
const PLACED_AFTER_THE_TAP_WITHIN_MS = 150;
const FIRST_OPENING_PLACED_WITHIN_MS = 300;
const MOVES_WITHIN_FRAMES_AFTER_THE_BUSY_ONE = 2;
const HIDDEN_TITLE_AT_MOST = 0.1;
const TITLE_ARRIVES_LATER = /^\/sprava\/darci\/[^/]+(\/[^/]+)?$/;
const LATE_TITLE_WITHIN_MS = 3000;
const HALF_WAY_X = EDGE + WIDTH / 2;

type Way = 'back-button' | 'swipe-completed' | 'swipe-cancelled';
type Look = 'light' | 'dark';

const WAYS: readonly Way[] = ['back-button', 'swipe-completed', 'swipe-cancelled'];
const LOOKS: readonly Look[] = ['light', 'dark'];
const WAY_NAMES: Record<Way, string> = {
  'back-button': '‹ is pressed',
  'swipe-completed': 'a finger takes it back past half and lets go',
  'swipe-cancelled': 'a finger takes it a short way and lets go',
};

interface Row {
  readonly name: string;
  readonly href: string;
  readonly from: string;
}

interface Frame {
  readonly at: number;
  readonly overlay: boolean;
  readonly offset: number | null;
  readonly tinted: boolean;
  readonly rounded: number;
  readonly titles: string[];
  readonly heads: string[];
}

interface HeadTitle {
  readonly text: string;
  readonly sheetHead: boolean;
  readonly opacity: number;
  readonly left: number;
  readonly right: number;
}

interface StepProbe {
  frames: Frame[];
  under: string | null;
  layered: boolean;
  done: boolean;
  tappedAt: number | null;
  placedAt: number | null;
  loadedCode: boolean;
  busyFrameAt: number | null;
  steepestPerMs: number;
  paced: boolean;
}

declare global {
  interface Window {
    nfnnStepProbe?: StepProbe;
    nfnnListScrolls?: number[];
    nfnnHeadTitles?: () => HeadTitle[];
    nfnnLateFrames?: { until: number; read: (reader: FrameRequestCallback) => void };
  }
}

const DONOR_ID = '019a1c00-0000-7000-8000-00000000b001';
const donorRow = {
  donorId: DONOR_ID,
  type: 'PERSON',
  name: 'Petr Svoboda',
  companyIdentifier: null,
  address: { street: 'Krátká 3', city: 'Děčín', postalCode: '405 02' },
  email: 'petr@example.cz',
  variableSymbol: '2234567890',
  preferredLocale: 'cs',
};

function news(index: number): Record<string, unknown> {
  return {
    id: `0199f3e0-0000-7000-8000-00000000d4${String(index).padStart(2, '0')}`,
    slug: `zprava-${index}`,
    title: `Zpráva ${index}`,
    tag: null,
    perex: 'Krátce o tom, co se u nás stalo, aby bylo v seznamu co číst a co odrolovat.',
    body: 'Text.',
    coverImage: null,
    publishedOn: `2026-10-${String(20 - index).padStart(2, '0')}`,
    createdAt: '2026-10-01T09:00:00Z',
    updatedAt: '2026-10-01T09:00:00Z',
    signer: null,
    lookBackYear: null,
    live: true,
  };
}

function story(index: number): Record<string, unknown> {
  return {
    id: `0199f3e0-0000-7000-8000-00000000d5${String(index).padStart(2, '0')}`,
    slug: `pribeh-${index}`,
    title: `Příběh ${index}`,
    year: 2025,
    category: 'CHILDREN',
    tag: 'Pomůcky',
    perex: 'Příběh, který se dá přečíst.',
    body: 'Text příběhu.',
    coverImage: null,
    publishedOn: `2025-10-${String(20 - index).padStart(2, '0')}`,
    createdAt: '2025-09-19T09:00:00Z',
    updatedAt: '2025-10-01T07:30:00Z',
    live: true,
  };
}

const NEWS = [1, 2, 3, 4, 5, 6, 7, 8].map(news);
const STORIES = [1, 2, 3, 4, 5, 6].map(story);

const FEATURES = join(__dirname, '..', 'src', 'app', 'features');

function routePaths(file: string): string[] {
  const text = readFileSync(join(FEATURES, file), 'utf8');
  return Array.from(text.matchAll(/path: '([^']*)'/g), (match) => match[1]);
}

function donorScreens(): string[] {
  return routePaths('donors/donors.routes.ts')
    .filter((path) => path !== '')
    .map((path) => `/darce/${path}`);
}

function fullScreenAdministration(): string[] {
  const text = readFileSync(join(FEATURES, 'admin/admin.routes.ts'), 'utf8');
  return Array.from(
    text.matchAll(/path: '([^']*)',\s*data: \{\s*adminFrame: 'full'/g),
    (match) => `/sprava/${match[1]}`,
  );
}

function onTheSheetGround(screens: Screens, row: Row): boolean {
  return screens.sheets && !fullScreenAdministration().includes(row.href);
}

function administrationScreens(): string[] {
  return routePaths('admin/admin.routes.ts')
    .filter((path) => path !== '' && !path.includes(':'))
    .map((path) => `/sprava/${path}`);
}

const DETAIL_LISTS: Record<string, string> = {
  'aktuality/:slug': '/aktuality',
  'projekty/:slug': '/projekty',
  'darci/:id': '/sprava/darci',
};

const DETAILS_LEFT_TO_THE_SIMULATOR: Record<string, string> = {
  'darci/:id/:section':
    'a section of the donor card opens from the card with data the card loads itself; the simulator walks it',
  'aktuality/:id':
    'the administration lists its news from the content copy, which this matrix does not seed; the simulator walks it',
  'projekty/:id':
    'the administration lists its stories from the content copy, which this matrix does not seed; the simulator walks it',
  'prehledy/:month':
    'a sent monthly report opens from the report history, which this matrix does not seed; the simulator walks it',
};

const SCREENS_SHOWN_ONLY_WITH_THEIR_DATA: Record<string, string> = {
  '/sprava/zalohy/historie':
    'Zálohy link Všechny zálohy only beside a stored backup, which this matrix does not seed; the simulator walks it',
  '/sprava/logy/soubory':
    'Logy a diagnostika link Starší soubory only when older log files exist, which this matrix does not seed; the simulator walks it',
  '/sprava/logy/soubor':
    'a log file opens with its name in the query, which the walk leaves out like a detail; the simulator walks it',
  '/sprava/logy/stav':
    'Logy a diagnostika link the state of the server only once its health answer arrives, which this matrix does not seed; the simulator walks it',
};

function detailScreens(): string[] {
  const content = routePaths('content/content.routes.ts');
  const administration = routePaths('admin/admin.routes.ts');
  return [...content, ...administration].filter((path) => path.includes(':'));
}

async function onThePhone(page: Page, look: Look): Promise<void> {
  await page.emulateMedia({ colorScheme: look, reducedMotion: 'no-preference' });
  await seeHeadTitles(page);
  await page.addInitScript((gap) => {
    Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true });
    Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => 5 });
    localStorage.setItem('nfnn.donor-session-app', '1');
    const gapSheet = new CSSStyleSheet();
    gapSheet.replaceSync(`:root { --sheet-top-gap: ${gap}px !important; }`);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, gapSheet];
  }, SHEET_TOP_GAP_PX);
  await page.route('**/api/donors/auth/refresh', (route) =>
    route.fulfill(session(200, administrator)),
  );
  await mockDonorApi(page);
  await page.route(
    (url) => url.pathname === '/api/content/news',
    (route) =>
      route.fulfill({
        json: { items: NEWS, page: 0, size: 10, total: NEWS.length, hasMore: false },
      }),
  );
  await page.route(
    (url) => url.pathname.startsWith('/api/content/news/'),
    (route) => {
      const slug = new URL(route.request().url()).pathname.split('/').pop();
      const found = NEWS.find((item) => item.slug === slug);
      return found ? route.fulfill({ json: found }) : route.fallback();
    },
  );
  await page.route(
    (url) => url.pathname === '/api/content/projects',
    (route) =>
      route.fulfill({
        json: { items: STORIES, page: 0, size: 50, total: STORIES.length, hasMore: false },
      }),
  );
  await page.route(
    (url) => url.pathname.startsWith('/api/content/projects/'),
    (route) => {
      const slug = new URL(route.request().url()).pathname.split('/').pop();
      const found = STORIES.find((item) => item.slug === slug);
      return found ? route.fulfill({ json: found }) : route.fallback();
    },
  );
  await serveAdministrationCopy(page, {
    donations: {
      'donations:2026-10': [
        administrationCopyGift(
          '0192f0f1-0000-7000-8000-0000000000b1',
          DONOR_ID,
          '2026-10-25',
          50000,
        ),
      ],
    },
    donors: { 'accounts:2026-10': [donorRow] },
  });
  await page.route(
    (url) => url.pathname === `/api/admin/donors/${DONOR_ID}`,
    (route) => route.fulfill({ json: donorRow }),
  );
}

async function seeHeadTitles(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.nfnnHeadTitles = () => {
      const overlay = document.querySelector('.page-transition');
      if (overlay === null) {
        return [];
      }
      return Array.from(
        overlay.querySelectorAll<HTMLElement>('.sheet-head-title, .edge-title'),
        (title) => {
          const box = title.getBoundingClientRect();
          const text = (title.textContent ?? '').replace(/\s+/g, ' ').trim();
          const shown =
            text !== '' &&
            getComputedStyle(title).visibility !== 'hidden' &&
            box.width > 0 &&
            box.right > 0 &&
            box.left < innerWidth &&
            box.bottom > 0 &&
            box.top < innerHeight;
          let opacity = shown ? 1 : 0;
          for (
            let node: Element | null = title;
            node !== null && node !== overlay.parentElement;
            node = node.parentElement
          ) {
            opacity *= Number(getComputedStyle(node).opacity);
          }
          return {
            text,
            sheetHead: title.matches('.sheet-head-title'),
            opacity,
            left: box.left,
            right: box.right,
          };
        },
      ).filter((title) => title.opacity > 0);
    };
  });
}

async function touchAt(page: Page, type: string, x: number): Promise<void> {
  await page.evaluate(
    ({ type, x, y }) => {
      type LegacyTouchDocument = Document & {
        createTouch?(
          view: Window,
          target: EventTarget,
          identifier: number,
          pageX: number,
          pageY: number,
          screenX: number,
          screenY: number,
        ): Touch;
        createTouchList?(...touches: Touch[]): TouchList;
      };
      const probe = window as unknown as { fingerTarget: Element };
      const document = window.document as LegacyTouchDocument;
      if (type === 'touchstart') {
        probe.fingerTarget = document.elementFromPoint(x, y) ?? document.body;
      }
      const target = probe.fingerTarget;
      const touches = (
        typeof document.createTouch === 'function' && typeof document.createTouchList === 'function'
          ? document.createTouchList(
              document.createTouch(window, target, 1, x + scrollX, y + scrollY, x, y),
            )
          : [new Touch({ identifier: 1, target, clientX: x, clientY: y })]
      ) as Touch[];
      const none = (
        typeof document.createTouchList === 'function' ? document.createTouchList() : []
      ) as Touch[];
      const touching = type !== 'touchend';
      target.dispatchEvent(
        new TouchEvent(type, {
          touches: touching ? touches : none,
          targetTouches: touching ? touches : none,
          changedTouches: touches,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    { type, x, y: FINGER_Y },
  );
}

async function restLongerThanAFlick(page: Page): Promise<void> {
  const restStartedAt = await page.evaluate(() => performance.now());
  await expect
    .poll(() => page.evaluate(() => performance.now()))
    .toBeGreaterThan(restStartedAt + FLICK_REST_MS);
}

function leavingOffset(page: Page): Promise<number> {
  return page
    .locator('.page-transition--swipe .page-transition__page--over')
    .evaluate((over) => Math.round(new DOMMatrixReadOnly(getComputedStyle(over).transform).m41));
}

function measuresFrames(page: Page): boolean {
  return page.context().browser()?.browserType().name() === 'chromium';
}

type FrameCost = 'busy' | 'drawn-late' | 'drawn-late-then-long';

async function watchTheStep(page: Page, cost: FrameCost = 'busy'): Promise<void> {
  await page.evaluate(
    ({ busyMs, lateMs, longMs, hiddenAtMost, paced }) => {
      const curves: Record<string, readonly number[]> = {
        linear: [0, 0, 1, 1],
        ease: [0.25, 0.1, 0.25, 1],
        'ease-in': [0.42, 0, 1, 1],
        'ease-out': [0, 0, 0.58, 1],
        'ease-in-out': [0.42, 0, 0.58, 1],
      };
      const theme = getComputedStyle(document.documentElement);
      const ease = theme.getPropertyValue('--ease-page').trim();
      const points =
        curves[ease] ??
        /^cubic-bezier\((.+)\)$/
          .exec(ease)?.[1]
          .split(',')
          .map((point) => Number(point.trim()));
      const durationText = theme.getPropertyValue('--duration-page').trim();
      const durationMs = Number.parseFloat(durationText) * (durationText.endsWith('ms') ? 1 : 1000);
      const along = (from: number, to: number, t: number): number =>
        3 * (1 - t) * (1 - t) * t * from + 3 * (1 - t) * t * t * to + t * t * t;
      let steepest = 0;
      if (points !== undefined && points.length === 4) {
        const [x1, y1, x2, y2] = points;
        for (let step = 0; step < 1000; step++) {
          const t = step / 1000;
          const next = (step + 1) / 1000;
          const dx = along(x1, x2, next) - along(x1, x2, t);
          const dy = along(y1, y2, next) - along(y1, y2, t);
          if (dx > 0) {
            steepest = Math.max(steepest, Math.abs(dy) / dx);
          }
        }
      }
      const probe: StepProbe = {
        frames: [],
        under: null,
        layered: false,
        done: false,
        tappedAt: null,
        placedAt: null,
        loadedCode: false,
        busyFrameAt: null,
        steepestPerMs: steepest / durationMs,
        paced,
      };
      window.nfnnStepProbe = probe;
      const started = performance.now();
      const seeLayers = (): void => {
        const under = document.querySelector('.page-transition .page-transition__page--under');
        probe.layered ||= document.querySelector('.page-transition') !== null;
        if (under !== null && probe.under === null) {
          probe.under = (under.textContent ?? '').replace(/\s+/g, ' ');
        }
        if (probe.layered && probe.under !== null) {
          layers.disconnect();
        }
      };
      const layers = new MutationObserver(seeLayers);
      layers.observe(document.body, { childList: true, subtree: true });
      seeLayers();
      for (const started of ['click', 'touchmove']) {
        window.addEventListener(started, () => (probe.tappedAt ??= performance.now()), {
          capture: true,
          once: true,
        });
      }
      const late = (window.nfnnLateFrames ??= (() => {
        const request = window.requestAnimationFrame.bind(window);
        const cancel = window.cancelAnimationFrame.bind(window);
        const requested = new Map<number, number>();
        const readers: FrameRequestCallback[] = [];
        let reading: { id: number; requestedIn: number } | null = null;
        let frameAt = -1;
        let next = 1_000_000_000;
        const readLast = (): void => {
          if (reading !== null) {
            cancel(reading.id);
          }
          reading = { id: request(readAll), requestedIn: frameAt };
        };
        const keepReadersLast = (): void => {
          if (reading !== null && reading.requestedIn === frameAt) {
            readLast();
          }
        };
        const state = {
          until: 0,
          read: (reader: FrameRequestCallback): void => {
            readers.push(reader);
            if (reading === null) {
              readLast();
            }
          },
        };
        const readAll = (now: number): void => {
          frameAt = now;
          reading = null;
          if (performance.now() < state.until) {
            readLast();
            return;
          }
          readers.splice(0).forEach((reader) => reader(now));
        };
        window.requestAnimationFrame = (callback) => {
          const id = next++;
          const run = (now: number): void => {
            frameAt = now;
            if (performance.now() < state.until) {
              requested.set(id, request(run));
              keepReadersLast();
              return;
            }
            requested.delete(id);
            callback(now);
          };
          requested.set(id, request(run));
          keepReadersLast();
          return id;
        };
        window.cancelAnimationFrame = (id) => {
          cancel(requested.get(id) ?? id);
          requested.delete(id);
        };
        return state;
      })());
      const keepBusy = (ms: number): void => {
        const from = performance.now();
        let at = from;
        while (at < from + ms) {
          at = performance.now();
        }
      };
      const bothPlaced = (): boolean =>
        document.querySelector('.page-transition__page--over') !== null &&
        document.querySelector('.page-transition__page--under') !== null;
      const placed = new MutationObserver(() => {
        if (!bothPlaced()) {
          return;
        }
        placed.disconnect();
        const placedAt = performance.now();
        probe.placedAt = placedAt;
        probe.loadedCode = performance
          .getEntriesByType('resource')
          .some(
            (entry) =>
              new URL(entry.name).pathname.endsWith('.js') &&
              entry.startTime + entry.duration >= (probe.tappedAt ?? started),
          );
        if (lateMs > 0) {
          late.until = placedAt + lateMs;
          requestAnimationFrame((now) => {
            probe.busyFrameAt = now;
            if (longMs > 0) {
              requestAnimationFrame(() => keepBusy(longMs));
            }
          });
        } else if (busyMs > 0) {
          requestAnimationFrame((now) => {
            probe.busyFrameAt = now;
            keepBusy(busyMs);
          });
        }
      });
      if (!bothPlaced()) {
        placed.observe(document.body, { childList: true, subtree: true });
      }
      let seen = false;
      let framesAfter = 0;
      const look = (now: number): void => {
        const overlay = document.querySelector('.page-transition');
        const over = overlay?.querySelector('.page-transition__page--over') ?? null;
        const under = overlay?.querySelector('.page-transition__page--under') ?? null;
        const layerStyle = overlay === null ? null : getComputedStyle(overlay);
        const filter =
          layerStyle?.backdropFilter || layerStyle?.getPropertyValue('-webkit-backdrop-filter');
        const corners = Array.from(
          overlay?.querySelectorAll<HTMLElement>('.page-transition__page') ?? [],
          (page) => {
            const style = getComputedStyle(page);
            return Math.max(
              ...[
                style.borderTopLeftRadius,
                style.borderTopRightRadius,
                style.borderBottomLeftRadius,
                style.borderBottomRightRadius,
              ].map((radius) => Number.parseFloat(radius) || 0),
            );
          },
        );
        const titles = (window.nfnnHeadTitles?.() ?? []).filter(
          (title) => title.opacity > hiddenAtMost,
        );
        probe.frames.push({
          at: now,
          overlay: overlay !== null,
          offset:
            over === null ? null : new DOMMatrixReadOnly(getComputedStyle(over).transform).m41,
          tinted:
            layerStyle !== null && (filter === undefined || filter === '' || filter === 'none'),
          rounded: Math.max(0, ...corners),
          titles: titles.map(
            (title) =>
              `${title.text} ${title.opacity.toFixed(2)} ${Math.round(title.left)}..${Math.round(title.right)}`,
          ),
          heads: titles.filter((title) => title.sheetHead).map((title) => title.text),
        });
        if (under !== null && probe.under === null) {
          probe.under = (under.textContent ?? '').replace(/\s+/g, ' ');
        }
        seen ||= overlay !== null;
        if (seen && overlay === null) {
          framesAfter++;
        }
        if (framesAfter > 2 || now - started > 5000) {
          placed.disconnect();
          layers.disconnect();
          probe.done = true;
          return;
        }
        late.read(look);
      };
      late.read(look);
    },
    {
      busyMs: measuresFrames(page) && cost === 'busy' ? BUSY_AS_ON_THE_PHONE_MS : 0,
      lateMs: measuresFrames(page) && cost !== 'busy' ? DRAWN_AS_LATE_AS_ON_THE_PHONE_MS : 0,
      longMs: measuresFrames(page) && cost === 'drawn-late-then-long' ? LONG_AS_ON_THE_PHONE_MS : 0,
      hiddenAtMost: HIDDEN_TITLE_AT_MOST,
      paced: measuresFrames(page),
    },
  );
}

async function stepSeen(page: Page): Promise<StepProbe> {
  await expect
    .poll(() => page.evaluate(() => window.nfnnStepProbe?.done ?? false), {
      timeout: STEP_ENDS_WITHIN_MS,
    })
    .toBe(true);
  return page.evaluate(() => window.nfnnStepProbe!);
}

function travelled(probe: StepProbe): Frame[] {
  const frames = probe.frames;
  const first = frames.findIndex((frame) => frame.overlay);
  let last = frames.length - 1;
  while (last > first && !frames[last].overlay) {
    last--;
  }
  expect(probe.layered, 'the step placed no moving page at all').toBe(true);
  if (probe.paced) {
    expect(first, 'the step drew no frame of its moving page').toBeGreaterThanOrEqual(0);
  } else if (first < 0) {
    return [];
  }
  const shown = frames.slice(first, last + 1);
  expect(
    shown.every((frame) => frame.overlay),
    'the moving page vanished and came back while it travelled',
  ).toBe(true);
  expect(
    shown.filter((frame) => frame.tinted).length,
    'frames in which Safari would tint the band under the clock from the moving layer',
  ).toBe(0);
  expect(
    Math.max(...shown.map((frame) => frame.rounded)),
    'the moving page had rounded corners',
  ).toBe(0);
  return shown.filter((frame) => frame.offset !== null);
}

function expectNoJump(probe: StepProbe, frames: readonly Frame[], width: number): void {
  expect(
    Number.isFinite(probe.steepestPerMs) && probe.steepestPerMs > 0,
    'the theme names no curve and duration for the page',
  ).toBe(true);
  for (let at = 1; at < frames.length; at++) {
    const gap = Math.abs(frames[at].offset! - frames[at - 1].offset!);
    const elapsed = frames[at].at - frames[at - 1].at;
    expect(
      gap,
      `the page jumped ${Math.round(gap)} px in ${Math.round(elapsed)} ms, faster than its curve`,
    ).toBeLessThanOrEqual(width * probe.steepestPerMs * elapsed + 2);
  }
}

function expectOneTitleAtATime(probe: StepProbe): void {
  expect(
    probe.frames
      .filter((frame) => frame.titles.length > 1)
      .map((frame) => frame.titles.join(' | ')),
    'frames in which two titles of the head showed at once',
  ).toEqual([]);
}

async function expectATitleHiddenHalfWay(page: Page): Promise<void> {
  const titles = await page.evaluate(
    () =>
      new Promise<HeadTitle[]>((drawn) =>
        requestAnimationFrame(() => drawn(window.nfnnHeadTitles?.() ?? [])),
      ),
  );
  if (titles.length > 0) {
    expect(
      Math.min(...titles.map((title) => title.opacity)),
      `no title of the head was hidden half way: ${titles.map((title) => title.text).join(' | ')}`,
    ).toBeLessThanOrEqual(HIDDEN_TITLE_AT_MOST);
  }
}

function firstMovedFrame(moving: readonly Frame[], from: number): Frame | null {
  return moving.find((frame) => Math.abs(frame.offset! - from) > 1) ?? null;
}

function expectFirstMovedFrameNear(
  probe: StepProbe,
  moving: readonly Frame[],
  from: number,
  way: number,
  what: string,
): void {
  if (!probe.paced || moving.length === 0) {
    return;
  }
  const moved = firstMovedFrame(moving, from);
  expect(moved, `the ${what} page never moved`).not.toBeNull();
  expect(
    Math.abs(moved!.offset! - from),
    `px the ${what} page had travelled in its first moved frame, of ${Math.round(way)} px`,
  ).toBeLessThanOrEqual(way * FIRST_MOVED_FRAME_AT_MOST);
}

function expectWithinTheBudget(probe: StepProbe, restingAt?: number): void {
  const moving = travelled(probe);
  const tappedAt = probe.tappedAt;
  expect(tappedAt, 'the tap was not seen').not.toBeNull();
  expect(probe.placedAt, 'the step never placed both copies').not.toBeNull();
  const placedWithin = probe.loadedCode
    ? FIRST_OPENING_PLACED_WITHIN_MS
    : PLACED_AFTER_THE_TAP_WITHIN_MS;
  expect(
    probe.placedAt! - tappedAt!,
    `ms from the tap until both copies were placed${probe.loadedCode ? ', loading the code of the page' : ''}`,
  ).toBeLessThanOrEqual(placedWithin);
  const moved = firstMovedFrame(moving, restingAt ?? moving[0].offset!);
  expect(moved, 'the page never moved').not.toBeNull();
  const busyFrameAt = probe.busyFrameAt;
  expect(busyFrameAt, 'no frame was drawn after both copies were placed').not.toBeNull();
  const framesBefore = probe.frames.filter(
    (frame) => frame.at > busyFrameAt! && frame.at < moved!.at,
  ).length;
  expect(
    framesBefore + 1,
    'the frame after the busy one in which the page first moved',
  ).toBeLessThanOrEqual(MOVES_WITHIN_FRAMES_AFTER_THE_BUSY_ONE);
}

async function expectEndedOnTheLiveTitle(page: Page, probe: StepProbe): Promise<void> {
  if (!probe.paced) {
    return;
  }
  const last = probe.frames.filter((frame) => frame.overlay).at(-1);
  if (last === undefined) {
    return;
  }
  const arrivesLater = TITLE_ARRIVES_LATER.test(new URL(page.url()).pathname);
  const seen = await page.evaluate(
    ({ hiddenAtMost, arrivesLater, longestMs }) =>
      new Promise<{ titles: string[][]; heading: string; settled: boolean }>((done) => {
        const oneLine = (text: string | null): string => (text ?? '').replace(/\s+/g, ' ').trim();
        const shown = (): string[] =>
          Array.from(document.querySelectorAll<HTMLElement>('.sheet-head-title'))
            .filter((title) => {
              const box = title.getBoundingClientRect();
              let opacity =
                title.closest('.page-transition') === null &&
                oneLine(title.textContent) !== '' &&
                getComputedStyle(title).visibility !== 'hidden' &&
                box.width > 0 &&
                box.right > 0 &&
                box.left < innerWidth &&
                box.bottom > 0 &&
                box.top < innerHeight
                  ? 1
                  : 0;
              for (let node: Element | null = title; node !== null; node = node.parentElement) {
                opacity *= Number(getComputedStyle(node).opacity);
              }
              return opacity > hiddenAtMost;
            })
            .map((title) => oneLine(title.textContent))
            .sort();
        const whole = (): boolean =>
          Array.from(document.querySelectorAll<HTMLElement>('.sheet-head-title')).every(
            (title) =>
              title.closest('.page-transition') !== null ||
              Number(getComputedStyle(title).opacity) >= 0.99,
          );
        const heading = (): string =>
          oneLine(document.querySelector('app-root .admin-page h1')?.textContent ?? null);
        const root = getComputedStyle(document.documentElement);
        const fastText = root.getPropertyValue('--duration-fast').trim();
        const fastMs = Number.parseFloat(fastText) * (fastText.endsWith('ms') ? 1 : 1000);
        const started = performance.now();
        const titles: string[][] = [];
        const look = (): void => {
          const now = shown();
          titles.push(now);
          const elapsed = performance.now() - started;
          const settled = arrivesLater
            ? now.length === 1 && now[0] === heading() && whole()
            : elapsed >= fastMs * 2;
          if (settled || elapsed > longestMs) {
            done({ titles, heading: heading(), settled });
            return;
          }
          requestAnimationFrame(look);
        };
        requestAnimationFrame(look);
      }),
    { hiddenAtMost: HIDDEN_TITLE_AT_MOST, arrivesLater, longestMs: LATE_TITLE_WITHIN_MS },
  );
  const ended = [...last.heads].sort();
  expect(
    seen.titles.filter((titles) => titles.length > 1),
    'frames after the step in which two titles of the head showed at once',
  ).toEqual([]);
  if (!arrivesLater) {
    expect(
      seen.titles.filter((titles) => titles.join(' | ') !== ended.join(' | ')),
      'titles of the head after the step, against the titles of its last frame',
    ).toEqual([]);
    return;
  }
  expect(seen.settled, 'the head never came to show the heading of the page whole').toBe(true);
  expect(seen.titles[0], 'the head changed its title as the step ended').toEqual(ended);
  if (ended.length === 0 || ended[0] === seen.heading) {
    expect(
      seen.titles.filter((titles) => titles.length > 0 && titles[0] !== seen.heading),
      'titles of the head after the step other than the heading of the page',
    ).toEqual([]);
    return;
  }
  const lastOld = seen.titles.reduce(
    (at, titles, index) => (titles[0] === ended[0] ? index : at),
    -1,
  );
  const firstNew = seen.titles.findIndex((titles) => titles[0] === seen.heading);
  expect(
    seen.titles.filter(
      (titles) => titles.length > 0 && ![ended[0], seen.heading].includes(titles[0]),
    ),
    'titles of the head after the step other than its last frame and the heading of the page',
  ).toEqual([]);
  expect(lastOld, 'the title of the step came back after the late title').toBeLessThan(firstNew);
  expect(
    firstNew - lastOld,
    'frames between the title of the step and the late title, which must fade out before the late one fades in',
  ).toBeGreaterThan(1);
}

async function fingerMovedThePage(page: Page): Promise<StepProbe> {
  await expect
    .poll(() =>
      page.evaluate(
        () => window.nfnnStepProbe?.frames.some((frame) => (frame.offset ?? 0) > 1) ?? false,
      ),
    )
    .toBe(true);
  return page.evaluate(() => window.nfnnStepProbe!);
}

function expectShownOnItsWay(
  probe: StepProbe,
  between: readonly Frame[],
  least: number,
  message: string,
): void {
  if (probe.paced) {
    expect(between.length, message).toBeGreaterThanOrEqual(least);
  }
}

function expectFirstShownNear(
  probe: StepProbe,
  moving: readonly Frame[],
  near: (offset: number) => void,
): void {
  if (probe.paced) {
    expect(moving.length, 'no frame showed the moving page placed').toBeGreaterThan(0);
    near(moving[0].offset!);
  }
}

function expectLeftAway(probe: StepProbe, width: number, from: number): void {
  const moving = travelled(probe);
  const between = moving.filter((frame) => frame.offset! > 1 && frame.offset! < width - 1);
  expectShownOnItsWay(probe, between, 2, 'no frame showed the leaving page on its way');
  expectFirstShownNear(probe, moving, (offset) =>
    expect(offset, 'px the leaving page had gone in its first frame').toBeLessThanOrEqual(
      from + width * FIRST_SHOWN_AT_MOST,
    ),
  );
  expectFirstMovedFrameNear(probe, moving, from, width - from, 'leaving');
  for (let at = 1; at < moving.length; at++) {
    expect(moving[at].offset!, 'the leaving page went back on its way').toBeGreaterThanOrEqual(
      moving[at - 1].offset! - 1,
    );
  }
  expectNoJump(probe, moving, width);
  expectOneTitleAtATime(probe);
}

function expectArrived(probe: StepProbe, width: number): void {
  const moving = travelled(probe);
  const between = moving.filter((frame) => frame.offset! > 1 && frame.offset! < width - 1);
  expectShownOnItsWay(probe, between, 2, 'no frame showed the arriving page on its way');
  expectFirstShownNear(probe, moving, (offset) =>
    expect(
      offset,
      'px the arriving page was from its place in its first frame',
    ).toBeGreaterThanOrEqual(width * (1 - FIRST_SHOWN_AT_MOST)),
  );
  expectFirstMovedFrameNear(probe, moving, width, width, 'arriving');
  for (let at = 1; at < moving.length; at++) {
    expect(moving[at].offset!, 'the arriving page went back on its way').toBeLessThanOrEqual(
      moving[at - 1].offset! + 1,
    );
  }
  expectNoJump(probe, moving, width);
  expectOneTitleAtATime(probe);
}

function expectSlidBack(probe: StepProbe, width: number, from: number): void {
  const moving = travelled(probe);
  expectFirstShownNear(probe, moving, (offset) =>
    expect(offset, 'px the page had come back in its first frame').toBeGreaterThanOrEqual(
      from * (1 - FIRST_SHOWN_AT_MOST),
    ),
  );
  const between = moving.filter((frame) => frame.offset! > 1 && frame.offset! < from - 1);
  expectShownOnItsWay(probe, between, 1, 'no frame showed the page on its way back');
  for (let at = 1; at < moving.length; at++) {
    expect(moving[at].offset!, 'the page went away again on its way back').toBeLessThanOrEqual(
      moving[at - 1].offset! + 1,
    );
  }
  expectNoJump(probe, moving, width);
  expectOneTitleAtATime(probe);
}

interface Colour {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
}

async function bandColour(page: Page): Promise<Colour> {
  const shot = await page.screenshot({
    clip: { x: 0, y: BAND.y, width: WIDTH, height: BAND.height },
    animations: 'allow',
  });
  const spread = await page.evaluate(async (bytes) => {
    const bitmap = await createImageBitmap(
      new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
    );
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    const data = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    const low = [255, 255, 255];
    const high = [0, 0, 0];
    for (let at = 0; at < data.length; at += 4) {
      for (let channel = 0; channel < 3; channel++) {
        low[channel] = Math.min(low[channel], data[at + channel]);
        high[channel] = Math.max(high[channel], data[at + channel]);
      }
    }
    return { low, high };
  }, Array.from(shot));
  for (let channel = 0; channel < 3; channel++) {
    expect(
      spread.high[channel] - spread.low[channel],
      'the background above the sheets shows more than one colour',
    ).toBeLessThanOrEqual(SAME_COLOUR);
  }
  return { red: spread.low[0], green: spread.low[1], blue: spread.low[2] };
}

function expectSameColour(seen: Colour, before: Colour, when: string): void {
  expect(
    Math.max(
      Math.abs(seen.red - before.red),
      Math.abs(seen.green - before.green),
      Math.abs(seen.blue - before.blue),
    ),
    `the background above the sheets changed its colour ${when}`,
  ).toBeLessThanOrEqual(SAME_COLOUR);
}

interface Screens {
  readonly sheets: boolean;
  shown(row: Row): Promise<void>;
  backButton(): Locator;
  returned(row: Row): Promise<void>;
  scrollTop(): Promise<number>;
  scrollTo(top: number): Promise<number>;
}

interface Swiped {
  readonly probe: StepProbe;
  readonly letGoAt: number;
}

async function swipeBack(
  page: Page,
  row: Row,
  completes: boolean,
  ground: Colour | null,
): Promise<Swiped> {
  const ways = completes ? [60, 120, 180, HALF_WAY_X, 250, 290] : [40, 70, 100, 120];
  await watchTheStep(page);
  await touchAt(page, 'touchstart', EDGE);
  for (const x of ways.slice(0, 2)) {
    await touchAt(page, 'touchmove', x);
  }
  const under = page.locator('.page-transition--swipe .page-transition__page--under');
  await expect(under, 'nothing lies under the page the finger takes').toContainText(row.name);
  await expect.poll(() => leavingOffset(page)).toBe(ways[1] - EDGE);
  if (measuresFrames(page)) {
    expectWithinTheBudget(await fingerMovedThePage(page), 0);
  }
  if (ground !== null) {
    expectSameColour(await bandColour(page), ground, 'under the finger');
  }
  for (const x of ways.slice(2)) {
    await touchAt(page, 'touchmove', x);
    if (x === HALF_WAY_X) {
      await expect.poll(() => leavingOffset(page)).toBe(x - EDGE);
      await expectATitleHiddenHalfWay(page);
    }
  }
  const letGoAt = ways.at(-1)!;
  await expect.poll(() => leavingOffset(page)).toBe(letGoAt - EDGE);
  if (ground !== null) {
    expectSameColour(await bandColour(page), ground, 'while the finger moved on');
  }
  await restLongerThanAFlick(page);
  await watchTheStep(page);
  await touchAt(page, 'touchend', letGoAt);
  return { probe: await stepSeen(page), letGoAt: letGoAt - EDGE };
}

async function stepBackFrom(page: Page, screens: Screens, row: Row, way: Way): Promise<void> {
  const ground = onTheSheetGround(screens, row) ? await bandColour(page) : null;
  if (way === 'back-button') {
    await watchTheStep(page);
    await screens.backButton().click();
    const probe = await stepSeen(page);
    expect(probe.under ?? '', 'the screen before was not under the leaving one').toContain(
      oneLine(row.name),
    );
    expectLeftAway(probe, WIDTH, 0);
    if (measuresFrames(page)) {
      expectWithinTheBudget(probe);
    }
    await expectEndedOnTheLiveTitle(page, probe);
    return;
  }
  const completes = way === 'swipe-completed';
  const { probe, letGoAt } = await swipeBack(page, row, completes, ground);
  if (completes) {
    expectLeftAway(probe, WIDTH, letGoAt);
  } else {
    expectSlidBack(probe, WIDTH, letGoAt);
  }
  await expectEndedOnTheLiveTitle(page, probe);
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

async function activeHref(page: Page): Promise<string | null> {
  return page.evaluate(() => document.activeElement?.getAttribute('href') ?? null);
}

async function walkRow(
  page: Page,
  screens: Screens,
  row: Row,
  way: Way,
  scrolled: boolean,
  link: Locator,
  open: () => Promise<void> = () => clickWithoutScrolling(link),
): Promise<void> {
  await motionsEnded(page);
  await screens.scrollTo(scrolled ? SCROLLED_BY_PX : 0);
  const shownBefore = (await placementOf(link)).shown;
  const groundBefore = onTheSheetGround(screens, row) ? await bandColour(page) : null;
  await watchTheStep(page);
  const top = await screens.scrollTop();
  await open();
  await screens.shown(row);
  const opening = await stepSeen(page);
  expect(opening.under ?? '', 'the screen before was not under the arriving one').toContain(
    oneLine(row.name),
  );
  expectArrived(opening, WIDTH);
  if (measuresFrames(page)) {
    expectWithinTheBudget(opening);
  }
  await expectEndedOnTheLiveTitle(page, opening);
  if (groundBefore !== null) {
    expectSameColour(await bandColour(page), groundBefore, 'when the next screen opened');
  }
  await stepBackFrom(page, screens, row, way);
  await expect(page.locator('.page-transition')).toHaveCount(0);
  if (way === 'swipe-cancelled') {
    await screens.shown(row);
    await screens.backButton().click();
    await screens.returned(row);
    await expect(page.locator('.page-transition')).toHaveCount(0);
    return;
  }
  await screens.returned(row);
  await expect.poll(() => activeHref(page), { message: 'the focus did not return' }).toBe(row.href);
  if (shownBefore) {
    await expect.poll(() => screens.scrollTop(), { message: 'the scroll was not kept' }).toBe(top);
  } else {
    await expectBroughtIntoViewTheLeast(page);
  }
  if (groundBefore !== null) {
    expectSameColour(await bandColour(page), groundBefore, 'after the step back');
  }
}

interface Placement {
  readonly shown: boolean;
  readonly atAnEdge: boolean;
}

async function placementOf(target: Locator): Promise<Placement> {
  const band = await target.evaluate(viewBand);
  return target.evaluate(placementWithin, band);
}

function placementWithin(element: Element, band: ViewBand): Placement {
  let scroller: Element | null = null;
  for (let parent = element.parentElement; parent !== null; parent = parent.parentElement) {
    if (parent === document.body || parent === document.documentElement) {
      continue;
    }
    const overflow = getComputedStyle(parent).overflowY;
    if (overflow === 'auto' || overflow === 'scroll') {
      scroller = parent;
      break;
    }
  }
  const box = element.getBoundingClientRect();
  const scrolling = scroller ?? document.documentElement;
  const atAnEnd =
    scrolling.scrollTop <= 0 ||
    scrolling.scrollTop >= scrolling.scrollHeight - scrolling.clientHeight - 1;
  return {
    shown: box.bottom > band.top && box.top < band.bottom,
    atAnEdge:
      atAnEnd || Math.abs(box.top - band.top) <= 1 || Math.abs(box.bottom - band.bottom) <= 1,
  };
}

async function expectBroughtIntoViewTheLeast(page: Page): Promise<void> {
  await expect
    .poll(() => placementOf(page.locator(':focus')), {
      message:
        'the focus came back to a row the screen did not show, and the screen did not bring it to its nearest edge',
    })
    .toEqual({ shown: true, atAnEdge: true });
}

function livePageTitle(page: Page): Locator {
  return page.locator('app-root .admin-page h1');
}

function rowLink(page: Page, row: Row): Locator {
  return page.locator(`.admin-frame a[href="${row.href}"]`).first();
}

function clickWithoutScrolling(link: Locator): Promise<void> {
  return link.evaluate((element: HTMLElement) => element.click());
}

function accountSheet(page: Page): Locator {
  return page.locator('app-account-sheet').getByRole('dialog');
}

async function accountListShown(page: Page): Promise<void> {
  await expect(accountSheet(page).getByRole('heading', { level: 2, name: 'Účet' })).toBeVisible();
}

async function openAccountSheetOverTheNews(page: Page): Promise<void> {
  await page.goto('/aktuality');
  await expect(page.getByRole('heading', { name: 'Zpráva 8' })).toBeVisible();
  await page.getByRole('banner').getByRole('button', { name: 'Účet' }).dispatchEvent('click');
  await accountListShown(page);
  await expect(page.locator('.page-transition')).toHaveCount(0);
  await sheetSettled(page);
}

function motionsEnded(page: Page): Promise<unknown> {
  return page.evaluate(() =>
    Promise.allSettled(
      document
        .getAnimations()
        .filter(
          (motion) =>
            motion.playState === 'running' &&
            motion.effect?.getComputedTiming().endTime !== Infinity,
        )
        .map((motion) => motion.finished),
    ),
  );
}

function sheetSettled(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const sheet = document.querySelector('app-account-sheet');
    return Promise.allSettled(
      document
        .getAnimations()
        .filter((motion) => {
          const effect = motion.effect;
          const target = effect instanceof KeyframeEffect ? effect.target : null;
          return (
            target !== null &&
            sheet?.contains(target) === true &&
            effect?.getComputedTiming().endTime !== Infinity
          );
        })
        .map((motion) => motion.finished),
    );
  });
}

async function accountRows(page: Page): Promise<Row[]> {
  const links = accountSheet(page).locator('a[href^="/darce/"], a[href="/sprava"]');
  const rows: Row[] = [];
  for (const link of await links.all()) {
    const href = (await link.getAttribute('href'))!;
    const name = (
      await link.locator('.ui-list__title, .account-profile-detail').first().innerText()
    ).trim();
    if (!rows.some((row) => row.href === href)) {
      rows.push({ name, href, from: 'Účet' });
    }
  }
  return rows;
}

function sheetPanel(page: Page): Locator {
  return accountSheet(page).locator('.dialog-panel');
}

function accountScreens(page: Page): Screens & { opening(row: Row): void } {
  let administrationCopied: (() => Promise<void>) | null = null;
  let copiedOnce = false;
  return {
    sheets: true,
    opening: (row) => {
      if (row.href === '/sprava' && !copiedOnce) {
        copiedOnce = true;
        administrationCopied = whenAdministrationCopied(page);
      }
    },
    shown: async (row) => {
      if (row.href === '/sprava') {
        await expect(page).toHaveURL(/\/sprava$/);
        await administrationCopied?.();
        administrationCopied = null;
        await expect(livePageTitle(page)).toBeVisible();
      } else {
        await expect(
          accountSheet(page).getByRole('heading', { level: 2, name: row.name, exact: true }),
        ).toBeVisible();
      }
      await expect(page.locator('.page-transition')).toHaveCount(0);
    },
    backButton: () =>
      page.url().endsWith('/sprava')
        ? page.getByRole('banner').getByRole('button', { name: 'Zpět' })
        : accountSheet(page).getByRole('button', { name: 'Zpět', exact: true }),
    returned: async () => {
      await accountListShown(page);
      await expect(page).toHaveURL(/\/aktuality$/);
    },
    scrollTop: () => sheetPanel(page).evaluate((panel) => Math.round(panel.scrollTop)),
    scrollTo: (top) =>
      sheetPanel(page).evaluate((panel, wanted) => {
        panel.scrollTop = Math.min(wanted, panel.scrollHeight - panel.clientHeight);
        return Math.round(panel.scrollTop);
      }, top),
  };
}

const ACCOUNT_LIST_ROW: Row = { name: 'Účet', href: '/darce/potvrzeni', from: 'Účet' };

async function backOnASectionLeftFromTheScrolledList(
  page: Page,
): Promise<{ screens: Screens; listTop: number; section: Locator }> {
  await openAccountSheetOverTheNews(page);
  const screens = accountScreens(page);
  await motionsEnded(page);
  const listTop = await screens.scrollTo(SCROLLED_BY_PX);
  expect(listTop, 'the list of the account does not scroll').toBeGreaterThan(0);
  await clickWithoutScrolling(accountSheet(page).locator('a[href="/darce/potvrzeni"]').first());
  const section = accountSheet(page).getByRole('heading', {
    level: 2,
    name: 'Potvrzení o daru',
    exact: true,
  });
  await expect(section).toBeVisible();
  await expect(page.locator('.page-transition')).toHaveCount(0);
  await clickWithoutScrolling(
    accountSheet(page).getByRole('link', { name: 'Ověřit potvrzení', exact: true }),
  );
  await expect(page).toHaveURL(/\/overit$/);
  await expect(page.locator('.page-transition')).toHaveCount(0);

  await page.getByRole('banner').getByRole('button', { name: 'Zpět' }).click();
  await expect(section).toBeVisible();
  await expect(page).toHaveURL(/\/aktuality$/);
  await expect(page.locator('.page-transition')).toHaveCount(0);
  return { screens, listTop, section };
}

function recordTheListScrollsUnderTheSection(page: Page): Promise<void> {
  return page.evaluate(() => {
    window.nfnnListScrolls = [];
    const look = (): void => {
      const under = document.querySelector<HTMLElement>(
        '.page-transition .page-transition__page--under .dialog-panel',
      );
      if (under !== null) {
        window.nfnnListScrolls!.push(Math.round(under.scrollTop));
      }
      if (window.nfnnListScrolls!.length < 600) {
        requestAnimationFrame(look);
      }
    };
    requestAnimationFrame(look);
  });
}

async function expectTheListUnderTheSectionAt(page: Page, listTop: number): Promise<void> {
  const seen = await page.evaluate(() => window.nfnnListScrolls ?? []);
  expect(seen.length, 'no frame showed the list under the leaving section').toBeGreaterThan(0);
  expect(
    seen.filter((top) => top !== listTop),
    'frames in which the list under the leaving section stood elsewhere than its scroll',
  ).toEqual([]);
}

function pageScroll(page: Page): Pick<Screens, 'scrollTop' | 'scrollTo'> {
  return {
    scrollTop: () => page.evaluate(() => Math.round(window.scrollY)),
    scrollTo: (top) =>
      page.evaluate((wanted) => {
        const most = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo({ top: Math.max(0, Math.min(wanted, most)), behavior: 'instant' });
        return Math.round(window.scrollY);
      }, top),
  };
}

function pathOf(page: Page): string {
  return new URL(page.url()).pathname;
}

function administrationScreensOf(page: Page): Screens {
  return {
    sheets: true,
    ...pageScroll(page),
    shown: async (row) => {
      await expect(page).toHaveURL((url) => url.pathname === row.href);
      await expect(livePageTitle(page)).toBeVisible();
      await expect(page.locator('.page-transition')).toHaveCount(0);
    },
    backButton: () => page.getByRole('banner').getByRole('button', { name: 'Zpět' }),
    returned: async (row) => {
      await expect(page).toHaveURL((url) => url.pathname === row.from);
      await expect(livePageTitle(page)).toBeVisible();
    },
  };
}

async function linksOut(under: string, within: Locator, from = under): Promise<Row[]> {
  const rows: Row[] = [];
  for (const link of await within.locator(`a[href^="${under}/"]`).all()) {
    const href = (await link.getAttribute('href'))!;
    const rest = href.slice(under.length + 1);
    if (rest === '' || rest.includes('/') || rest.includes('?') || rest.includes('#')) {
      continue;
    }
    if (!rows.some((row) => row.href === href)) {
      const name = (await link.innerText()).split('\n')[0].trim();
      rows.push({ name, href, from });
    }
  }
  return rows;
}

async function openAdministrationAt(page: Page, trail: readonly string[]): Promise<void> {
  if (pathOf(page) === trail.at(-1)) {
    return;
  }
  const copied = whenAdministrationCopied(page);
  await page.goto('/sprava');
  await copied();
  for (const href of trail.slice(1)) {
    await clickWithoutScrolling(page.locator(`.admin-frame a[href="${href}"]`).first());
    await expect(page).toHaveURL((url) => url.pathname === href);
    await expect(page.locator('.page-transition')).toHaveCount(0);
  }
}

for (const look of LOOKS) {
  for (const way of WAYS) {
    test.describe(`Given an administrator in the app on the home screen of a phone, in the ${look} appearance`, () => {
      test.use({ viewport: { width: WIDTH, height: HEIGHT }, hasTouch: true });

      test.beforeEach(({ page }) => onThePhone(page, look));

      test(`when ${WAY_NAMES[way]} on every screen opened from the account sheet, then it travels back over the account sheet without a jump, over one still background, with the scroll and the focus kept`, async ({
        page,
      }) => {
        test.setTimeout(240_000);
        await openAccountSheetOverTheNews(page);
        const rows = await accountRows(page);
        expect(rows.map((row) => row.href)).toEqual(
          expect.arrayContaining([...donorScreens(), '/sprava']),
        );
        const screens = accountScreens(page);
        for (const row of rows) {
          for (const scrolled of [false, true]) {
            await test.step(`${row.name}${scrolled ? ', scrolled' : ''}`, () =>
              walkRow(
                page,
                screens,
                row,
                way,
                scrolled,
                accountSheet(page).locator(`a[href="${row.href}"]`).first(),
                () => {
                  screens.opening(row);
                  return clickWithoutScrolling(
                    accountSheet(page).locator(`a[href="${row.href}"]`).first(),
                  );
                },
              ));
          }
        }
      });

      test(`when ${WAY_NAMES[way]} on every section and subpage of Správa, then it travels back over the screen it came from without a jump, over one still background, with the scroll and the focus kept`, async ({
        page,
      }) => {
        test.setTimeout(480_000);
        const screens = administrationScreensOf(page);
        const seen = new Set<string>();
        const origins: { trail: string[]; rows: Row[] }[] = [];
        await openAdministrationAt(page, ['/sprava']);
        origins.push({
          trail: ['/sprava'],
          rows: await linksOut('/sprava', page.locator('.admin-frame')),
        });
        for (const origin of origins) {
          for (const row of origin.rows) {
            if (seen.has(row.href)) {
              continue;
            }
            seen.add(row.href);
            for (const scrolled of [false, true]) {
              await openAdministrationAt(page, origin.trail);
              await test.step(`${row.href}${scrolled ? ', scrolled' : ''}`, () =>
                walkRow(page, screens, row, way, scrolled, rowLink(page, row), async () => {
                  await clickWithoutScrolling(rowLink(page, row));
                  if (!scrolled && origin.trail.length < 3) {
                    await screens.shown(row);
                    const frame = page.locator('.admin-frame');
                    const known = (href: string): boolean =>
                      origins.some((each) => each.rows.some((other) => other.href === href));
                    const deeper = [
                      ...(await linksOut(row.href, frame)),
                      ...(await linksOut('/sprava', frame, row.href)).filter(
                        (link) => !known(link.href),
                      ),
                    ];
                    if (deeper.length > 0) {
                      origins.push({ trail: [...origin.trail, row.href], rows: deeper });
                    }
                  }
                }));
            }
          }
        }
        expect(
          administrationScreens().filter((path) => !seen.has(path)),
          'a screen of Správa the walk did not reach',
        ).toEqual(Object.keys(SCREENS_SHOWN_ONLY_WITH_THEIR_DATA));
      });

      test(`when ${WAY_NAMES[way]} on Nastavení opened from Občas a pro technika, then it travels back over Občas a pro technika without a jump, one title of the head at a time, with the scroll and the focus kept`, async ({
        page,
      }) => {
        test.setTimeout(120_000);
        const screens = administrationScreensOf(page);
        const trail = ['/sprava', '/sprava/vice'];
        await openAdministrationAt(page, trail);
        const link = page.locator('.admin-frame a[href="/sprava/nastaveni"]').first();
        const row: Row = {
          name: (await link.innerText()).split('\n')[0].trim(),
          href: '/sprava/nastaveni',
          from: '/sprava/vice',
        };
        for (const scrolled of [false, true]) {
          await openAdministrationAt(page, trail);
          await test.step(`${row.href} from ${row.from}${scrolled ? ', scrolled' : ''}`, () =>
            walkRow(page, screens, row, way, scrolled, link));
        }
      });

      test(`when ${WAY_NAMES[way]} on every detail, then it travels back over its list without a jump, with the scroll and the focus kept`, async ({
        page,
      }) => {
        test.setTimeout(240_000);
        const details = detailScreens();
        expect(
          details.filter(
            (path) => DETAIL_LISTS[path] === undefined && !DETAILS_LEFT_TO_THE_SIMULATOR[path],
          ),
          'a detail screen without a row in the matrix',
        ).toEqual([]);
        for (const [path, list] of Object.entries(DETAIL_LISTS)) {
          const administration = list.startsWith('/sprava');
          if (administration) {
            await openAdministrationAt(page, ['/sprava', list]);
          } else {
            await page.goto(list);
          }
          await expect(page.locator('main h1, .admin-page h1').first()).toBeVisible();
          const within = page.locator(administration ? '.admin-frame' : 'main').first();
          await expect(within.locator(`a[href^="${list}/"]`).first()).toBeVisible();
          const [detail] = await linksOut(list, within);
          expect(detail, `${list} offers no ${path}`).toBeDefined();
          const screens: Screens = {
            sheets: administration,
            ...pageScroll(page),
            shown: async () => {
              await expect(page).toHaveURL((url) => url.pathname === detail.href);
              await expect(page.locator('main h1, .admin-page h1').first()).toBeVisible();
              await expect(page.locator('.page-transition')).toHaveCount(0);
            },
            backButton: () => page.getByRole('banner').getByRole('button', { name: 'Zpět' }),
            returned: async () => {
              await expect(page).toHaveURL((url) => url.pathname === list);
            },
          };
          for (const scrolled of [false, true]) {
            await test.step(`${path}${scrolled ? ', scrolled' : ''}`, () =>
              walkRow(
                page,
                screens,
                detail,
                way,
                scrolled,
                within.locator(`a[href="${detail.href}"]`).first(),
              ));
          }
        }
      });
    });
  }

  test.describe(`Given a donor in the app on the home screen of a phone with the account list scrolled, in the ${look} appearance`, () => {
    test.use({ viewport: { width: WIDTH, height: HEIGHT }, hasTouch: true });

    test.beforeEach(({ page }) => onThePhone(page, look));

    test('when a section opened from the list leads out of the sheet and ‹ steps back twice, then the section and then the list come back, the list at its scroll, without a jump', async ({
      page,
    }) => {
      const { screens, listTop } = await backOnASectionLeftFromTheScrolledList(page);
      await recordTheListScrollsUnderTheSection(page);
      await watchTheStep(page);
      await screens.backButton().click();
      const probe = await stepSeen(page);

      expect(probe.under ?? '', 'the list was not under the leaving section').toContain('Účet');
      expectLeftAway(probe, WIDTH, 0);
      await accountListShown(page);
      await expect
        .poll(() => activeHref(page), { message: 'the focus did not return' })
        .toBe('/darce/potvrzeni');
      expect(await screens.scrollTop(), 'the list did not stand at its scroll').toBe(listTop);
      await expectTheListUnderTheSectionAt(page, listTop);
    });

    for (const completes of [true, false]) {
      test(`when a section opened from the list leads out of the sheet, ‹ brings it back and ${completes ? WAY_NAMES['swipe-completed'] : WAY_NAMES['swipe-cancelled']}, then the list follows the finger under it at its scroll`, async ({
        page,
      }) => {
        const { screens, listTop, section } = await backOnASectionLeftFromTheScrolledList(page);
        await recordTheListScrollsUnderTheSection(page);

        const { probe, letGoAt } = await swipeBack(page, ACCOUNT_LIST_ROW, completes, null);

        if (completes) {
          expectLeftAway(probe, WIDTH, letGoAt);
          await accountListShown(page);
          await expect
            .poll(() => screens.scrollTop(), { message: 'the list did not stand at its scroll' })
            .toBe(listTop);
        } else {
          expectSlidBack(probe, WIDTH, letGoAt);
          await expect(section).toBeVisible();
        }
        await expect(page.locator('.page-transition')).toHaveCount(0);
        await expectTheListUnderTheSectionAt(page, listTop);
      });
    }
  });

  test.describe(`Given an administrator in the app on the home screen of a phone that draws the first frame of a step late while its page waits, in the ${look} appearance`, () => {
    test.use({ viewport: { width: WIDTH, height: HEIGHT }, hasTouch: true });
    test.skip(
      ({ browserName }) => browserName !== 'chromium',
      'only Chromium lets the probe hold back the frames after a step is placed and read every frame; the simulator measures WebKit on the phone',
    );

    test.beforeEach(({ page }) => onThePhone(page, look));

    const lateFrames: readonly (readonly [FrameCost, string, string])[] = [
      [
        'drawn-late',
        'it moves within two frames after the late one and its first moved frame comes at most a fifth of the way',
        'the page moves within two frames after the late one and its first moved frame comes at most a fifth of the way',
      ],
      [
        'drawn-late-then-long',
        'its first moved frame comes at most a fifth of the way even when the frame after the late one lasts long too',
        'its first moved frame comes at most a fifth of the way even when the frame after the late one lasts long too',
      ],
    ];
    for (const [cost, opens, steps] of lateFrames) {
      const withinTheBudget = (probe: StepProbe): void => {
        if (cost === 'drawn-late') {
          expectWithinTheBudget(probe);
        }
      };

      test(`when each section of the account sheet opens for the first time, then ${opens}`, async ({
        page,
      }) => {
        test.setTimeout(120_000);
        await openAccountSheetOverTheNews(page);
        const screens = accountScreens(page);
        const rows = (await accountRows(page)).filter((row) => row.href !== '/sprava');
        expect(rows.map((row) => row.href)).toEqual(expect.arrayContaining(donorScreens()));
        for (const row of rows) {
          await test.step(row.name, async () => {
            await motionsEnded(page);
            await watchTheStep(page, cost);
            await clickWithoutScrolling(
              accountSheet(page).locator(`a[href="${row.href}"]`).first(),
            );
            await screens.shown(row);
            const opening = await stepSeen(page);
            expectArrived(opening, WIDTH);
            withinTheBudget(opening);
            await screens.backButton().click();
            await screens.returned(row);
            await expect(page.locator('.page-transition')).toHaveCount(0);
          });
        }
      });

      test(`when ‹ is pressed on Platby, Zálohy and Lidé fondu, then ${steps}`, async ({
        page,
      }) => {
        test.setTimeout(120_000);
        const screens = administrationScreensOf(page);
        const sections: readonly (readonly [readonly string[], string])[] = [
          [['/sprava'], '/sprava/platby'],
          [['/sprava', '/sprava/vice'], '/sprava/zalohy'],
          [['/sprava', '/sprava/vice'], '/sprava/lide-fondu'],
        ];
        for (const [trail, href] of sections) {
          await openAdministrationAt(page, trail);
          const link = page.locator(`.admin-frame a[href="${href}"]`).first();
          const row: Row = {
            name: (await link.innerText()).split('\n')[0].trim(),
            href,
            from: trail.at(-1)!,
          };
          await test.step(href, async () => {
            await clickWithoutScrolling(link);
            await screens.shown(row);
            await motionsEnded(page);
            await watchTheStep(page, cost);
            await screens.backButton().click();
            const probe = await stepSeen(page);
            expectLeftAway(probe, WIDTH, 0);
            withinTheBudget(probe);
            await screens.returned(row);
            await expect(page.locator('.page-transition')).toHaveCount(0);
          });
        }
      });
    }
  });

  test.describe(`Given a visitor on a wide screen, in the ${look} appearance`, () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test.beforeEach(({ page }) => onThePhone(page, look));

    test('when an article opens from the news and the app steps back, then no layer moves the pages or their titles', async ({
      page,
    }) => {
      await page.goto('/aktuality');
      const article = page.locator('main a[href="/aktuality/zprava-1"]').first();
      await expect(article).toBeVisible();
      await watchTheStep(page);
      await clickWithoutScrolling(article);
      await expect(page).toHaveURL('/aktuality/zprava-1');
      expect((await stepSeen(page)).frames.filter((frame) => frame.overlay)).toEqual([]);

      await watchTheStep(page);
      await stepBack(page);
      await expect(page).toHaveURL('/aktuality');
      expect((await stepSeen(page)).frames.filter((frame) => frame.overlay)).toEqual([]);
    });
  });

  test.describe(`Given a donor in the app on the home screen of a phone with the account sheet open over the scrolled news, in the ${look} appearance`, () => {
    test.use({ viewport: { width: WIDTH, height: HEIGHT }, hasTouch: true });

    test.beforeEach(({ page }) => onThePhone(page, look));

    for (const away of [false, true]) {
      test(`when the step back closes the sheet ${away ? 'with Účet scrolled away with the news' : 'with Účet still on the screen'}, then the sheet goes down without a jump, the focus returns to Účet and ${away ? 'the news moves the least that brings Účet back on the screen' : 'the news stays where it was'}`, async ({
        page,
      }) => {
        await page.goto('/aktuality');
        await expect(page.getByRole('heading', { name: 'Zpráva 8' })).toBeVisible();
        const account = page.getByRole('banner').getByRole('button', { name: 'Účet' });
        const stillShown = await account.evaluate((button: HTMLElement) =>
          Math.max(0, Math.floor(button.getBoundingClientRect().top + window.scrollY) - 1),
        );
        const top = await pageScroll(page).scrollTo(away ? SCROLLED_BY_PX : stillShown);
        expect((await placementOf(account)).shown, 'Účet shows before the sheet opens').toBe(!away);
        await account.evaluate((button: HTMLElement) => button.focus({ preventScroll: true }));
        expect(await pageScroll(page).scrollTop(), 'the news moved before the sheet opened').toBe(
          top,
        );
        await page.keyboard.press('Enter');
        await accountListShown(page);
        await sheetSettled(page);
        expect(await pageScroll(page).scrollTop(), 'the news moved as the sheet opened').toBe(top);
        await page.evaluate(() => {
          const seen: number[] = [];
          (window as unknown as { nfnnSheetTops: number[] }).nfnnSheetTops = seen;
          const look = (): void => {
            const panel = document.querySelector('app-account-sheet .dialog-panel');
            if (panel === null) {
              return;
            }
            seen.push(panel.getBoundingClientRect().top);
            requestAnimationFrame(look);
          };
          requestAnimationFrame(look);
        });

        await stepBack(page);

        await expect(accountSheet(page)).toHaveCount(0);
        const tops = await page.evaluate(
          () => (window as unknown as { nfnnSheetTops: number[] }).nfnnSheetTops,
        );
        if (measuresFrames(page)) {
          expect(
            tops.filter((at) => at > tops[0] + 1 && at < HEIGHT - 1).length,
            'no frame showed the sheet on its way down',
          ).toBeGreaterThan(0);
        }
        for (let at = 1; at < tops.length; at++) {
          expect(tops[at]).toBeGreaterThanOrEqual(tops[at - 1] - 1);
        }
        await expect(account).toBeFocused();
        if (away) {
          await expectBroughtIntoViewTheLeast(page);
          expect(await pageScroll(page).scrollTop()).toBeLessThan(top);
        } else {
          await expect.poll(() => pageScroll(page).scrollTop()).toBe(top);
        }
      });
    }
  });
}
