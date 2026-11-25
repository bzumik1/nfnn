import type { CDPSession, Locator, Page, TestInfo } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { viewBand, type ViewBand } from '../src/app/core/layout/focus-in-view';
import {
  LATE_FRAME_PAST_THE_STEADY_ONE,
  FIRST_HALF_JUDGED_WITHIN_MS,
  STEADY_FRAME_MARK,
  steadyFrameInMotion,
  steadyFrameMs,
} from '../src/app/core/navigation/frame-pace';
import {
  administrationCopyGift,
  administrator,
  mockDonorApi,
  serveAdministrationCopy,
  session,
  whenAdministrationCopied,
} from './donor-session';
import { expect, test } from './fixtures';
import {
  type BudgetCheck,
  judgedAgainstTheRunner,
  slowedForTheKnownDefect,
  TIMED_MOTION_TAG,
} from './runner-speed';
import {
  addProbeInitScript,
  NOT_JUDGED_ANNOTATION,
  evaluateAsProbe,
  type FrameReader,
  PROBE_SCRIPT,
  type SampleCost,
  sampleFrames,
} from './top-area';

export const WIDTH = 390;
export const HEIGHT = 700;
const FINGER_Y = 420;
const EDGE = 20;
const FLICK_REST_MS = 100;
const SHEET_TOP_GAP_PX = 80;
const BAND = { y: 4, height: 20 };
const SAME_COLOUR = 3;
const SAME_SPREAD = 6;
const LIVE_CLOCK_STEP_MS = 1;
const GROUND_CHANGES_WITH_THE_SCRIM = ['/sprava'];
export const SCROLLED_BY_PX = 160;
const STEP_ENDS_WITHIN_MS = 6000;
const FIRST_SHOWN_AT_MOST = 0.25;
const BUSY_AS_ON_THE_PHONE_MS = 140;
const DRAWN_AS_LATE_AS_ON_THE_PHONE_MS = 140;
const LONG_AS_ON_THE_PHONE_MS = 80;
const PLACED_AFTER_THE_TAP_WITHIN_MS = 150;
const FIRST_OPENING_PLACED_WITHIN_MS = 300;
const FRAME_AT_60_HZ_MS = 1000 / 60;
const framesAt60Hz = (ms: number): number => Math.round(ms / FRAME_AT_60_HZ_MS);
export const PLACED_WITHIN_FRAMES = framesAt60Hz(PLACED_AFTER_THE_TAP_WITHIN_MS);
export const FIRST_OPENING_PLACED_WITHIN_FRAMES = framesAt60Hz(FIRST_OPENING_PLACED_WITHIN_MS);
const REVIEWED_STAMP_LAG = JSON.parse(readFileSync(join(__dirname, 'stamp-lag.json'), 'utf8')) as {
  prodesk: { p99Frames: number };
  ci: { p99Frames: number };
};
export const PRODESK_STAMP_LAG_P99_FRAMES = REVIEWED_STAMP_LAG.prodesk.p99Frames;
export const CI_STAMP_LAG_P99_FRAMES = REVIEWED_STAMP_LAG.ci.p99Frames;
export const STAMP_LAG_P99_FRAMES = Math.max(PRODESK_STAMP_LAG_P99_FRAMES, CI_STAMP_LAG_P99_FRAMES);
const PACE_FRAMES_AT_MOST = 3;
export const STAMP_LAG_ANNOTATION = 'nfnn-stamp-lag';
const PLANTED_PAST_MS = 240;
const PLANTED_PAST_TIMES_THE_TOLERANCE = 2;
const MARKER_Y = 350;
const MARKER_HEIGHT = 4;
const MARKER_CLEAR_OF_CHROME_PX = 24;
const CHROME = 'app-header, app-sheet-head, app-tab-bar, .page-transition__bar-item';
const MARKER_COLOUR = 'rgb(255, 0, 255)';
const MARKER_CLASS = 'nfnn-probe-marker';
const SCREEN_READS_DIFFER_BY_DEVICE_PX = 2;
const SCREEN_ANCHOR: ScreenAnchor = 'first-moved';
const SCROLL_SETTLES_WITHIN_MS = 5000;
export const LONGEST_FRAME_BEFORE_PLACING = 3;
export const PLACING_ANNOTATION = 'nfnn-placing';
const NOT_JUDGED_REASON =
  'not judged on this runner: its screencast drew no frame for at least the motion’s length less one frame';
const HIDDEN_TITLE_AT_MOST = 0.1;
const TITLE_ARRIVES_LATER = /^\/sprava\/darci\/[^/]+(\/[^/]+)?$/;
const LATE_TITLE_WITHIN_MS = 3000;
const HALF_WAY_X = EDGE + WIDTH / 2;
const KEPT_CALLBACK_TIMES = 5000;
const LONG_FRAME_MS = 50;

type Way = 'back-button' | 'swipe-completed' | 'swipe-cancelled';
type Look = 'light' | 'dark';

export interface MotionGate {
  readonly timed: boolean;
  readonly tags: readonly string[];
  readonly placed: string;
  readonly firstOpeningPlaced: string;
  readonly placedAfterTheTap: string;
  readonly firstHalf: string;
}

const ON_THE_RUNNER =
  'on a runner as fast as the reference (budget scaled by the runner’s speed, at most 1.5×; judged only on the Prodesk and in the nightly)';

export const FRAMES_GATE: MotionGate = {
  timed: false,
  tags: [],
  placed: `both copies placed within ${PLACED_WITHIN_FRAMES} frames of the tap (D1, ${PLACED_AFTER_THE_TAP_WITHIN_MS} ms at 60 Hz; ${FIRST_OPENING_PLACED_WITHIN_FRAMES} frames, ${FIRST_OPENING_PLACED_WITHIN_MS} ms, while the page’s code loads)`,
  firstOpeningPlaced: `both copies placed within ${FIRST_OPENING_PLACED_WITHIN_FRAMES} frames of the tap (${FIRST_OPENING_PLACED_WITHIN_MS} ms at 60 Hz, first opening)`,
  placedAfterTheTap: `both copies placed within ${PLACED_WITHIN_FRAMES} frames of the tap (D1, ${PLACED_AFTER_THE_TAP_WITHIN_MS} ms at 60 Hz)`,
  firstHalf: `on the screen, where the runner captures frames, the page never goes back nor runs ahead of its curve by more than ${LATE_FRAME_PAST_THE_STEADY_ONE} steady frames plus the p99 stamp lag of the runner's screencast`,
};

export const TIMED_GATE: MotionGate = {
  timed: true,
  tags: [TIMED_MOTION_TAG],
  placed: `both copies placed within ${PLACED_AFTER_THE_TAP_WITHIN_MS} ms (${FIRST_OPENING_PLACED_WITHIN_MS} ms while the page’s code loads) ${ON_THE_RUNNER}`,
  firstOpeningPlaced: `both copies placed within ${FIRST_OPENING_PLACED_WITHIN_MS} ms ${ON_THE_RUNNER}`,
  placedAfterTheTap: `both copies placed within ${PLACED_AFTER_THE_TAP_WITHIN_MS} ms ${ON_THE_RUNNER}`,
  firstHalf: `each frame of the first half on the screen within ${LATE_FRAME_PAST_THE_STEADY_ONE} steady frames and no frame frozen (Prodesk/nightly only) ${ON_THE_RUNNER}`,
};

export const MOTION_GATES: readonly MotionGate[] = [FRAMES_GATE, TIMED_GATE];

export const WAYS: readonly Way[] = ['back-button', 'swipe-completed', 'swipe-cancelled'];
export const LOOKS: readonly Look[] = ['light', 'dark'];
export const WAY_NAMES: Record<Way, string> = {
  'back-button': '‹ is pressed',
  'swipe-completed': 'a finger takes it back past half and lets go',
  'swipe-cancelled': 'a finger takes it a short way and lets go',
};

export interface Row {
  readonly name: string;
  readonly href: string;
  readonly from: string;
}

export interface Frame {
  readonly at: number;
  readonly readAt: number;
  readonly overlay: boolean;
  readonly offset: number | null;
  readonly tinted: boolean;
  readonly rounded: number;
  readonly titles: string[];
  readonly heads: string[];
  readonly live: string[];
  readonly motion: Motion | null;
  readonly covered?: string | null;
}

interface Motion {
  readonly durationMs: number;
  readonly curve: number[] | null;
  readonly startTime: number | null;
  readonly currentTime?: number | null;
  readonly playState?: string;
  readonly easing?: string;
  readonly name?: string;
}

interface LongFrameScript {
  readonly source: string;
  readonly startTime: number;
  readonly durationMs: number;
  readonly forcedStyleAndLayoutMs: number;
}

interface LongFrame {
  readonly startTime: number;
  readonly durationMs: number;
  readonly blockingMs: number;
  readonly styleAndLayoutMs: number;
  readonly scripts: LongFrameScript[];
}

interface LongFrameEntry extends PerformanceEntry {
  readonly blockingDuration: number;
  readonly styleAndLayoutStart: number;
  readonly scripts: readonly {
    readonly sourceURL: string;
    readonly invoker: string;
    readonly startTime: number;
    readonly duration: number;
    readonly forcedStyleAndLayoutDuration: number;
  }[];
}

interface TimeSpent {
  readonly at: number;
  readonly from: number;
  readonly ms: number;
}

interface LateFrames {
  until: number;
  read: (reader: FrameRequestCallback) => void;
  callbacks: TimeSpent[];
}

interface HeadTitle {
  readonly text: string;
  readonly sheetHead: boolean;
  readonly opacity: number;
  readonly left: number;
  readonly right: number;
}

export interface StepProbe {
  frames: Frame[];
  under: string | null;
  layered: boolean;
  done: boolean;
  tappedAt: number | null;
  placedAt: number | null;
  loadedCode: boolean;
  busyFrameAt: number | null;
  longFrames: LongFrame[] | null;
  steepestPerMs: number;
  curve: number[] | null;
  durationMs: number;
  paced: boolean;
  liveClock: boolean;
  heading: string;
  settled: boolean;
  steadyBeforeMs: number | null;
  startedAt: number;
  busy: { readonly from: number; readonly to: number }[];
  sampleCosts: SampleCost[];
  appCallbacks: TimeSpent[];
  judged?: BudgetCheck[];
  screen?: ScreenShot[] | null;
  markerY?: number;
  markedAt?: number;
}

export interface ScreenShot {
  readonly at: number;
  readonly offset: number | null;
  readonly devicePx: number;
  readonly png?: string;
}

interface ScreenRecording {
  readonly cdp: CDPSession;
  readonly shots: { readonly data: string; readonly at: number }[];
}

const recordings = new WeakMap<Page, ScreenRecording>();

async function stopScreen(page: Page): Promise<ScreenRecording | null> {
  const recording = recordings.get(page) ?? null;
  recordings.delete(page);
  if (recording !== null) {
    await recording.cdp.send('Page.stopScreencast').catch(() => undefined);
    await recording.cdp.detach().catch(() => undefined);
  }
  return recording;
}

async function startScreen(page: Page): Promise<void> {
  await stopScreen(page);
  if (!measuresFrames(page)) {
    return;
  }
  const cdp = await page.context().newCDPSession(page);
  const shots: { data: string; at: number }[] = [];
  cdp.on('Page.screencastFrame', (shot) => {
    shots.push({ data: shot.data, at: (shot.metadata.timestamp ?? Number.NaN) * 1000 });
    cdp.send('Page.screencastFrameAck', { sessionId: shot.sessionId }).catch(() => undefined);
  });
  await cdp.send('Page.startScreencast', {
    format: 'png',
    everyNthFrame: 1,
    maxWidth: WIDTH,
    maxHeight: HEIGHT,
  });
  recordings.set(page, { cdp, shots });
}

async function screenOf(page: Page, markerY: number): Promise<ScreenShot[] | null> {
  const recording = await stopScreen(page);
  if (recording === null) {
    return null;
  }
  const origin = await page.evaluate(() => performance.timeOrigin);
  const reader = await page.context().newPage();
  try {
    const offsets = await reader.evaluate(
      async ({ pictures, markerY, markerHeight, viewportWidth }) => {
        const found: { edge: number | null; devicePx: number }[] = [];
        for (const picture of pictures) {
          const bytes = Uint8Array.from(atob(picture), (character) => character.charCodeAt(0));
          const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
          const scale = bitmap.width / viewportWidth;
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          const context = canvas.getContext('2d', { willReadFrequently: true });
          if (context === null) {
            throw new Error('no 2D canvas to read the screencast with');
          }
          context.drawImage(bitmap, 0, 0);
          const row = Math.round((markerY + markerHeight / 2) * scale);
          const pixels = context.getImageData(0, row, bitmap.width, 1).data;
          let edge: number | null = null;
          for (let x = 0; x < bitmap.width; x++) {
            const at = x * 4;
            if (pixels[at] > 180 && pixels[at + 1] < 90 && pixels[at + 2] > 180) {
              edge = x / scale;
              break;
            }
          }
          found.push({ edge, devicePx: 1 / scale });
        }
        return found;
      },
      {
        pictures: recording.shots.map((shot) => shot.data),
        markerY,
        markerHeight: MARKER_HEIGHT,
        viewportWidth: page.viewportSize()?.width ?? WIDTH,
      },
    );
    return recording.shots.map((shot, index) => ({
      at: shot.at - origin,
      offset: offsets[index].edge,
      devicePx: offsets[index].devicePx,
      png: shot.data,
    }));
  } finally {
    await reader.close();
  }
}

declare global {
  interface Window {
    nfnnStepProbe?: StepProbe;
    nfnnListScrolls?: number[];
    nfnnHeadTitles?: () => HeadTitle[];
    nfnnLateFrames?: LateFrames;
    nfnnFrameReaders?: Record<string, FrameReader>;
    nfnnSampleCosts?: SampleCost[];
    nfnnSheetTops?: number[];
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

export function donorScreens(): string[] {
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

function groundChangesWithTheScrim(row: Row): boolean {
  return GROUND_CHANGES_WITH_THE_SCRIM.includes(row.href);
}

export function administrationScreens(): string[] {
  return routePaths('admin/admin.routes.ts')
    .filter((path) => path !== '' && !path.includes(':'))
    .map((path) => `/sprava/${path}`);
}

export const DETAIL_LISTS: Record<string, string> = {
  'aktuality/:slug': '/aktuality',
  'projekty/:slug': '/projekty',
  'darci/:id': '/sprava/darci',
};

export const DETAILS_LEFT_TO_THE_SIMULATOR: Record<string, string> = {
  'darci/:id/:section':
    'a section of the donor card opens from the card with data the card loads itself; the simulator walks it',
  'aktuality/:id':
    'the administration lists its news from the content copy, which this matrix does not seed; the simulator walks it',
  'projekty/:id':
    'the administration lists its stories from the content copy, which this matrix does not seed; the simulator walks it',
  'prehledy/:month':
    'a sent monthly report opens from the report history, which this matrix does not seed; the simulator walks it',
};

export const SCREENS_SHOWN_ONLY_WITH_THEIR_DATA: Record<string, string> = {
  '/sprava/zalohy/historie':
    'Zálohy link Všechny zálohy only beside a stored backup, which this matrix does not seed; the simulator walks it',
  '/sprava/logy/soubory':
    'Logy a diagnostika link Starší soubory only when older log files exist, which this matrix does not seed; the simulator walks it',
  '/sprava/logy/soubor':
    'a log file opens with its name in the query, which the walk leaves out like a detail; the simulator walks it',
  '/sprava/logy/stav':
    'Logy a diagnostika link the state of the server only once its health answer arrives, which this matrix does not seed; the simulator walks it',
};

export function detailScreens(): string[] {
  const content = routePaths('content/content.routes.ts');
  const administration = routePaths('admin/admin.routes.ts');
  return [...content, ...administration].filter((path) => path.includes(':'));
}

export async function onThePhone(page: Page, look: Look): Promise<void> {
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
  await addProbeInitScript(page, () => {
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

export function measuresFrames(page: Page): boolean {
  return page.context().browser()?.browserType().name() === 'chromium';
}

function readsTransformsByLiveClock(page: Page): boolean {
  return page.context().browser()?.browserType().name() === 'webkit';
}

export type FrameCost = 'busy' | 'drawn-late' | 'drawn-late-then-long';

export async function watchTheStep(page: Page, cost: FrameCost = 'busy'): Promise<void> {
  await startScreen(page);
  await evaluateAsProbe(
    page,
    ({
      busyMs,
      lateMs,
      longMs,
      hiddenAtMost,
      paced,
      liveClock,
      arrivesLaterPattern,
      lateTitleWithinMs,
      steadyFrameMark,
      kept,
      marker,
    }) => {
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
        longFrames: null,
        steepestPerMs: steepest / durationMs,
        curve: points?.length === 4 ? [...points] : null,
        durationMs,
        paced,
        liveClock,
        heading: '',
        settled: false,
        steadyBeforeMs: null,
        startedAt: performance.now(),
        busy: [],
        sampleCosts: [],
        appCallbacks: [],
      };
      const arrivesLater = new RegExp(arrivesLaterPattern);
      const oneLine = (text: string | null): string => (text ?? '').replace(/\s+/g, ' ').trim();
      const liveTitles = (): string[] =>
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
      const liveTitlesWhole = (): boolean =>
        Array.from(document.querySelectorAll<HTMLElement>('.sheet-head-title')).every(
          (title) =>
            title.closest('.page-transition') !== null ||
            Number(getComputedStyle(title).opacity) >= 0.99,
        );
      const pageHeading = (): string =>
        oneLine(document.querySelector('app-root .admin-page h1')?.textContent ?? null);
      const curveOf = (easing: string): number[] | null => {
        const named = curves[easing];
        if (named !== undefined) {
          return [...named];
        }
        const listed = /^cubic-bezier\((.+)\)$/
          .exec(easing)?.[1]
          .split(',')
          .map((point) => Number(point.trim()));
        return listed?.length === 4 && listed.every(Number.isFinite) ? listed : null;
      };
      const motionOf = (page: Element | null): Motion | null => {
        const animation = page?.getAnimations?.()[0];
        const timing = animation?.effect?.getComputedTiming();
        if (animation === undefined || timing === undefined) {
          return null;
        }
        const keyframed = 'animationName' in animation;
        return {
          durationMs: Number(timing.duration),
          curve: keyframed ? probe.curve : curveOf(String(timing.easing ?? '')),
          startTime: animation.startTime === null ? null : Number(animation.startTime),
          currentTime: animation.currentTime === null ? null : Number(animation.currentTime),
          playState: animation.playState,
          easing: String(timing.easing ?? ''),
          name: keyframed ? (animation as CSSAnimation).animationName : 'script',
        };
      };
      const fastText = theme.getPropertyValue('--duration-fast').trim();
      const fastMs = Number.parseFloat(fastText) * (fastText.endsWith('ms') ? 1 : 1000);
      window.nfnnStepProbe = probe;
      const started = performance.now();
      const appSteadyFrame = (): number | null => {
        const mark = performance.getEntriesByName(steadyFrameMark, 'mark').at(-1) as
          PerformanceMark | undefined;
        const steady = (mark?.detail as { steadyBeforeMs?: unknown } | undefined)?.steadyBeforeMs;
        return mark !== undefined && mark.startTime >= started && typeof steady === 'number'
          ? steady
          : null;
      };
      const longFrames = PerformanceObserver.supportedEntryTypes.includes('long-animation-frame')
        ? new PerformanceObserver((list) => {
            const sourceOf = (url: string, invoker: string): string => {
              try {
                const source = new URL(url);
                return source.origin === location.origin ? source.pathname : source.href;
              } catch {
                return url === '' ? invoker : url;
              }
            };
            for (const entry of list.getEntries() as LongFrameEntry[]) {
              probe.longFrames?.push({
                startTime: entry.startTime,
                durationMs: entry.duration,
                blockingMs: entry.blockingDuration,
                styleAndLayoutMs:
                  entry.styleAndLayoutStart > 0
                    ? entry.startTime + entry.duration - entry.styleAndLayoutStart
                    : 0,
                scripts: entry.scripts.map((script) => ({
                  source: sourceOf(script.sourceURL, script.invoker),
                  startTime: script.startTime,
                  durationMs: script.duration,
                  forcedStyleAndLayoutMs: script.forcedStyleAndLayoutDuration,
                })),
              });
            }
          })
        : null;
      if (longFrames !== null) {
        probe.longFrames = [];
        longFrames.observe({ type: 'long-animation-frame' });
      }
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
      for (const started of ['click', 'touchmove', 'touchend']) {
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
        const callbacks: TimeSpent[] = [];
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
        const state: LateFrames = {
          until: 0,
          callbacks,
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
            const from = performance.now();
            try {
              callback(now);
            } finally {
              callbacks.push({ at: now, from, ms: performance.now() - from });
              callbacks.splice(0, Math.max(0, callbacks.length - kept));
            }
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
        probe.busy.push({ from, to: at });
      };
      const bothPlaced = (): boolean =>
        document.querySelector('.page-transition__page--over') !== null &&
        document.querySelector('.page-transition__page--under') !== null;
      const chromeOutside = (over: Element): { name: string; rect: DOMRect }[] =>
        Array.from(document.querySelectorAll(marker.chrome))
          .filter((element) => !over.contains(element))
          .map((element) => ({
            name: `${element.tagName.toLowerCase()}${element.classList[0] ? `.${element.classList[0]}` : ''}`,
            rect: element.getBoundingClientRect(),
          }))
          .filter(({ rect }) => rect.width > 0 && rect.height > 0);
      const coverOfTheLine = (): string | null => {
        const over = document.querySelector('.page-transition__page--over');
        if (over === null || probe.markerY === undefined) {
          return null;
        }
        const left = Math.max(0, over.getBoundingClientRect().left);
        const top = probe.markerY - marker.clear;
        const bottom = probe.markerY + marker.height + marker.clear;
        return (
          chromeOutside(over).find(
            ({ rect }) =>
              rect.bottom > top && rect.top < bottom && rect.right > left && rect.left < innerWidth,
          )?.name ?? null
        );
      };
      const markMovingPage = (): void => {
        const over = document.querySelector('.page-transition__page--over');
        if (!paced || over === null || over.querySelector(`.${marker.className}`) !== null) {
          return;
        }
        const box = over.getBoundingClientRect();
        const middle = innerHeight / 2;
        const rects = chromeOutside(over).map(({ rect }) => rect);
        const freeTop = Math.max(
          box.top,
          ...rects.filter((rect) => rect.bottom <= middle).map((rect) => rect.bottom),
        );
        const freeBottom = Math.min(
          box.bottom,
          ...rects.filter((rect) => rect.top >= middle).map((rect) => rect.top),
        );
        const atY = Math.round(
          Math.min(
            Math.max((freeTop + freeBottom) / 2, freeTop + marker.clear),
            freeBottom - marker.clear - marker.height,
          ),
        );
        probe.markerY = atY;
        probe.markedAt = performance.now();
        const line = document.createElement('div');
        line.className = marker.className;
        line.style.cssText = `position: absolute; left: 0; width: 100%; top: ${atY - box.top}px; height: ${marker.height}px; background: ${marker.colour}; z-index: 2147483647; pointer-events: none;`;
        over.append(line);
      };
      const placed = new MutationObserver(() => {
        if (!bothPlaced()) {
          return;
        }
        markMovingPage();
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
      if (bothPlaced()) {
        markMovingPage();
      } else {
        placed.observe(document.body, { childList: true, subtree: true });
      }
      let seen = document.querySelector('.page-transition') !== null;
      let framesAfter = 0;
      let goneAt: number | null = null;
      const look = (now: number): boolean => {
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
        const readAt = performance.now();
        const offset =
          over === null ? null : new DOMMatrixReadOnly(getComputedStyle(over).transform).m41;
        probe.frames.push({
          at: now,
          readAt,
          overlay: overlay !== null,
          offset,
          covered: paced ? coverOfTheLine() : null,
          tinted:
            layerStyle !== null && (filter === undefined || filter === '' || filter === 'none'),
          rounded: Math.max(0, ...corners),
          titles: titles.map(
            (title) =>
              `${title.text} ${title.opacity.toFixed(2)} ${Math.round(title.left)}..${Math.round(title.right)}`,
          ),
          heads: titles.filter((title) => title.sheetHead).map((title) => title.text),
          live: overlay === null ? liveTitles() : [],
          motion: motionOf(over),
        });
        if (under !== null && probe.under === null) {
          probe.under = (under.textContent ?? '').replace(/\s+/g, ' ');
        }
        seen ||= overlay !== null;
        if (seen && overlay === null) {
          framesAfter++;
          goneAt ??= now;
        }
        const live = probe.frames.at(-1)!.live;
        probe.heading = pageHeading();
        probe.settled = arrivesLater.test(location.pathname)
          ? live.length === 1 && live[0] === probe.heading && liveTitlesWhole()
          : goneAt !== null && now - goneAt >= fastMs * 2;
        const followed =
          !paced || goneAt === null || probe.settled || now - goneAt > lateTitleWithinMs;
        if ((framesAfter > 2 && followed) || (goneAt === null && now - started > 5000)) {
          placed.disconnect();
          layers.disconnect();
          longFrames?.disconnect();
          probe.steadyBeforeMs = appSteadyFrame();
          probe.done = true;
          return false;
        }
        return true;
      };
      (window.nfnnFrameReaders ??= {}).step = { read: look, inFrame: true };
    },
    {
      busyMs: measuresFrames(page) && cost === 'busy' ? BUSY_AS_ON_THE_PHONE_MS : 0,
      lateMs: measuresFrames(page) && cost !== 'busy' ? DRAWN_AS_LATE_AS_ON_THE_PHONE_MS : 0,
      longMs: measuresFrames(page) && cost === 'drawn-late-then-long' ? LONG_AS_ON_THE_PHONE_MS : 0,
      hiddenAtMost: HIDDEN_TITLE_AT_MOST,
      paced: measuresFrames(page),
      liveClock: readsTransformsByLiveClock(page),
      arrivesLaterPattern: TITLE_ARRIVES_LATER.source,
      lateTitleWithinMs: LATE_TITLE_WITHIN_MS,
      steadyFrameMark: STEADY_FRAME_MARK,
      kept: KEPT_CALLBACK_TIMES,
      marker: {
        className: MARKER_CLASS,
        y: MARKER_Y,
        height: MARKER_HEIGHT,
        colour: MARKER_COLOUR,
        clear: MARKER_CLEAR_OF_CHROME_PX,
        chrome: CHROME,
      },
    },
  );
  await sampleFrames(page, { readers: ['step'] });
}

export async function stepSeen(page: Page): Promise<StepProbe> {
  await expect
    .poll(() => page.evaluate(() => window.nfnnStepProbe?.done ?? false), {
      timeout: STEP_ENDS_WITHIN_MS + LATE_TITLE_WITHIN_MS,
    })
    .toBe(true);
  const sofar = await probeSoFar(page);
  const seen = { ...sofar, screen: await screenOf(page, sofar.markerY ?? MARKER_Y) };
  return seen;
}

async function probeSoFar(page: Page): Promise<StepProbe> {
  const probe = await page.evaluate(() => {
    const probe = window.nfnnStepProbe!;
    return {
      ...probe,
      sampleCosts: [...(window.nfnnSampleCosts ?? [])],
      appCallbacks: (window.nfnnLateFrames?.callbacks ?? []).filter(
        (callback) =>
          callback.from >= probe.startedAt &&
          !probe.busy.some(
            (busy) => busy.from >= callback.from && busy.to <= callback.from + callback.ms,
          ),
      ),
    };
  });
  return { ...probe, judged: judgedAgainstTheRunner(page) ?? undefined };
}

function withinScaledBudget(
  probe: StepProbe,
  check: Omit<BudgetCheck, 'slack'> & { readonly slack?: number },
): void {
  const judged = { ...check, slack: check.slack ?? 0 };
  if (probe.judged === undefined) {
    expect(judged.measured, judged.what).toBeLessThanOrEqual(judged.budget + judged.slack);
    return;
  }
  probe.judged.push(judged);
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

export function expectNoJump(probe: StepProbe, frames: readonly Frame[], width: number): void {
  expect(
    Number.isFinite(probe.steepestPerMs) && probe.steepestPerMs > 0,
    'the theme names no curve and duration for the page',
  ).toBe(true);
  const shownAt = (frame: Frame): number => (probe.liveClock ? frame.readAt : frame.at);
  const clockStepMs = probe.liveClock ? LIVE_CLOCK_STEP_MS : 0;
  for (let at = 1; at < frames.length; at++) {
    const gap = Math.abs(frames[at].offset! - frames[at - 1].offset!);
    const elapsed = shownAt(frames[at]) - shownAt(frames[at - 1]);
    expect(
      gap,
      `the page jumped ${Math.round(gap)} px in ${Math.round(elapsed)} ms, faster than its curve`,
    ).toBeLessThanOrEqual(width * probe.steepestPerMs * (elapsed + clockStepMs) + 2);
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

function onTheScreen(probe: StepProbe, moving: readonly Frame[]): readonly Frame[] {
  if (probe.screen == null) {
    return moving;
  }
  const sourceOf = (at: number): Frame | undefined =>
    [...probe.frames].reverse().find((frame) => frame.at <= at);
  return probe.screen.flatMap((shot) => {
    const source = sourceOf(shot.at);
    if (
      source === undefined ||
      !source.overlay ||
      source.offset === null ||
      probe.markedAt === undefined ||
      shot.at <= probe.markedAt
    ) {
      return [];
    }
    const offset = shot.offset ?? (source.offset >= WIDTH - 1 ? WIDTH : null);
    return offset === null ? [] : [{ ...source, at: shot.at, readAt: shot.at, offset }];
  });
}

export type ScreenAnchor = 'start' | 'first-moved';

export interface ScreenMotion {
  readonly shots: readonly { readonly at: number; readonly offset: number }[];
  readonly from: number;
  readonly to: number;
  readonly curve: readonly number[];
  readonly durationMs: number;
  readonly steadyMs: number;
  readonly placedAt: number;
  readonly startTime: number | null;
  readonly anchor: ScreenAnchor;
  readonly lagFrames: number;
  readonly measurePx: number;
}

const BACK_AT_MOST = 0.005;
const FROZEN_AFTER_MS = 100;

function progressOf(motion: ScreenMotion): { at: number; share: number }[] {
  const way = motion.to - motion.from;
  return [...motion.shots]
    .sort((one, other) => one.at - other.at)
    .map((shot) => ({ at: shot.at, share: (shot.offset - motion.from) / way }));
}

function percentOf(share: number): string {
  return `${(share * 100).toFixed(1)} %`;
}

export function framesBetweenRestAndEnd(motion: ScreenMotion): number {
  return progressOf(motion).filter(
    (shot) => shot.share > BACK_AT_MOST && shot.share < 1 - BACK_AT_MOST,
  ).length;
}

export function screencastMissedTheMotion(
  shotTimes: readonly number[],
  startAt: number,
  durationMs: number,
  frameMs: number,
): string | null {
  const endAt = startAt + durationMs;
  const within = [startAt, ...shotTimes.filter((at) => at > startAt && at < endAt), endAt].sort(
    (one, other) => one - other,
  );
  const gap = Math.max(0, ...within.slice(1).map((at, index) => at - within[index]));
  return gap >= durationMs - frameMs
    ? `the screencast drew no frame for ${Math.round(gap)} ms of a ${Math.round(durationMs)} ms motion, so the page's way cannot be judged on this runner`
    : null;
}

function notJudgedOnThisRunner(what: string, reason: string): void {
  test.info().annotations.push({ type: NOT_JUDGED_ANNOTATION, description: `${what}: ${reason}` });
}

export function probeSawTheMotion(
  frames: readonly Pick<Frame, 'at' | 'offset'>[],
  startAt: number,
  durationMs: number,
): boolean {
  const offsets = frames
    .filter((frame) => frame.at >= startAt && frame.at <= startAt + durationMs)
    .map((frame) => frame.offset)
    .filter((offset): offset is number => offset !== null);
  return offsets.length < 2 || Math.max(...offsets) - Math.min(...offsets) >= 1;
}

function screencastMissedTheStep(probe: StepProbe, moving: readonly Frame[]): string | null {
  if (probe.screen == null) {
    return null;
  }
  const motion = [...moving, ...probe.frames].find((frame) => frame.motion != null)?.motion;
  const startAt = motion?.startTime ?? probe.placedAt ?? probe.markedAt ?? 0;
  const durationMs = motion?.durationMs ?? probe.durationMs;
  const missed = screencastMissedTheMotion(
    probe.screen.map((shot) => shot.at),
    startAt,
    durationMs,
    probe.steadyBeforeMs ?? FRAME_AT_60_HZ_MS,
  );
  return missed !== null &&
    probeSawTheMotion(
      probe.frames.filter((frame) => frame.overlay),
      startAt,
      durationMs,
    )
    ? missed
    : null;
}

export function skipWhereNotJudged(testInfo: TestInfo): void {
  const steps = testInfo.annotations.filter(
    (annotation) => annotation.type === NOT_JUDGED_ANNOTATION,
  );
  if (testInfo.status === 'passed' && steps.length > 0) {
    testInfo.skip(
      true,
      `${NOT_JUDGED_REASON} in ${steps.length} step${steps.length === 1 ? '' : 's'}`,
    );
  }
}

export function judgedOnTheScreen(motion: ScreenMotion): string[] {
  const shown = progressOf(motion);
  const between = shown.filter(
    (shot) => shot.share > BACK_AT_MOST && shot.share < 1 - BACK_AT_MOST,
  );
  if (between.length < 2) {
    return [
      `the screencast showed ${between.length} frame${between.length === 1 ? '' : 's'} of the page between its rest and its end, too few to judge it on the screen`,
    ];
  }
  const curveAt = (elapsedMs: number): number =>
    springShareAt(motion.curve, Math.max(0, elapsedMs) / motion.durationMs);
  const backComputed =
    between[0].at - springFractionAt(motion.curve, between[0].share) * motion.durationMs;
  const start =
    motion.startTime === null
      ? backComputed
      : motion.anchor === 'first-moved'
        ? Math.min(backComputed, motion.startTime + motion.lagFrames * motion.steadyMs)
        : motion.startTime;
  const problems: string[] = [];
  if (start < motion.placedAt - motion.steadyMs) {
    problems.push(
      `the motion on the screen started ${(motion.placedAt - start).toFixed(0)} ms before both copies were placed (anchored at ${motion.anchor === 'first-moved' ? 'its first moved frame' : 'the start the browser set'}), a jump at the start`,
    );
  }
  const aheadFrames = LATE_FRAME_PAST_THE_STEADY_ONE + motion.lagFrames;
  shown.forEach((shot, index) => {
    const before = shown[index - 1];
    if (before === undefined || before.share >= 1 - BACK_AT_MOST) {
      return;
    }
    const sinceBefore = shot.at - before.at;
    const steepest = curveAt(sinceBefore + aheadFrames * motion.steadyMs);
    if (shot.share - Math.max(0, before.share) > steepest + BACK_AT_MOST) {
      problems.push(
        `the page ran ahead of its curve on the screen: it went from ${percentOf(Math.max(0, before.share))} to ${percentOf(shot.share)} of its way in ${sinceBefore.toFixed(0)} ms, more than the ${percentOf(steepest)} its curve covers at its steepest in that time and ${aheadFrames.toFixed(2)} steady frames (${LATE_FRAME_PAST_THE_STEADY_ONE} plus the screencast's p99 stamp lag of ${motion.lagFrames.toFixed(2)}), a jump`,
      );
    }
  });
  const backAtMost = Math.max(BACK_AT_MOST, motion.measurePx / Math.abs(motion.to - motion.from));
  shown.forEach((shot, index) => {
    const before = shown[index - 1];
    if (before !== undefined && shot.share < before.share - backAtMost) {
      problems.push(
        `the page went back on the screen from ${percentOf(before.share)} to ${percentOf(shot.share)} of its way at ${(shot.at - start).toFixed(0)} ms of its motion`,
      );
    }
    const elapsed = shot.at - start;
    const allowed = curveAt(elapsed + aheadFrames * motion.steadyMs) - curveAt(elapsed);
    if (shot.share - curveAt(elapsed) > allowed + BACK_AT_MOST) {
      problems.push(
        `the page ran ahead of its curve on the screen: ${percentOf(shot.share)} of its way at ${elapsed.toFixed(0)} ms of its motion against ${percentOf(curveAt(elapsed))} on the curve, more than ${aheadFrames.toFixed(2)} steady frames of ${motion.steadyMs.toFixed(1)} ms ahead (${LATE_FRAME_PAST_THE_STEADY_ONE} plus the screencast's p99 stamp lag of ${motion.lagFrames.toFixed(2)}), ${percentOf(allowed)} of its way at that point`,
      );
    }
  });
  return problems;
}

export function frozenOnTheScreen(motion: ScreenMotion): string[] {
  const shown = progressOf(motion);
  const start = motion.startTime ?? shown[0]?.at ?? 0;
  const curveAt = (at: number): number =>
    springShareAt(motion.curve, Math.max(0, at - start) / motion.durationMs);
  return shown.slice(1).flatMap((shot, index) => {
    const before = shown[index];
    const stood = Math.abs(shot.share - before.share) <= BACK_AT_MOST;
    const went = curveAt(shot.at) - curveAt(before.at) > BACK_AT_MOST;
    return shot.at - before.at >= FROZEN_AFTER_MS &&
      stood &&
      went &&
      before.share > BACK_AT_MOST &&
      before.share < 1 - BACK_AT_MOST
      ? [
          `the page stood still on the screen for ${(shot.at - before.at).toFixed(0)} ms at ${percentOf(before.share)} of its way while its curve went on`,
        ]
      : [];
  });
}

function firstMovedFrame(moving: readonly Frame[], from: number): Frame | null {
  return moving.find((frame) => Math.abs(frame.offset! - from) > 1) ?? null;
}

function bezierAt(from: number, to: number, t: number): number {
  return 3 * (1 - t) * (1 - t) * t * from + 3 * (1 - t) * t * t * to + t * t * t;
}

function solvedFor(value: number, at: (t: number) => number): number {
  let low = 0;
  let high = 1;
  for (let round = 0; round < 40; round++) {
    const middle = (low + high) / 2;
    if (at(middle) < value) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return (low + high) / 2;
}

function springShareAt(curve: readonly number[], fraction: number): number {
  const [x1, y1, x2, y2] = curve;
  const clamped = Math.min(1, Math.max(0, fraction));
  return bezierAt(
    y1,
    y2,
    solvedFor(clamped, (t) => bezierAt(x1, x2, t)),
  );
}

function springFractionAt(curve: readonly number[], share: number): number {
  const [x1, y1, x2, y2] = curve;
  const clamped = Math.min(1, Math.max(0, share));
  return bezierAt(
    x1,
    x2,
    solvedFor(clamped, (t) => bezierAt(y1, y2, t)),
  );
}

function steadyFrameOf(probe: StepProbe): number {
  expect(
    probe.steadyBeforeMs,
    'the app published no steady frame before the motion of the step',
  ).not.toBeNull();
  return probe.steadyBeforeMs!;
}

function screenMotionOf(
  probe: StepProbe,
  moving: readonly Frame[],
  from: number,
  way: number,
): ScreenMotion {
  const motion = moving.find((frame) => frame.motion?.curve != null)?.motion;
  const end = moving[moving.length - 1]?.offset ?? from;
  return {
    shots: moving.map((frame) => ({ at: frame.at, offset: frame.offset! })),
    from,
    to: end < from ? from - way : from + way,
    curve: motion?.curve ?? probe.curve ?? [0, 0, 1, 1],
    durationMs: motion?.durationMs ?? probe.durationMs,
    steadyMs: steadyFrameOf(probe),
    placedAt: probe.placedAt ?? probe.markedAt ?? moving[0]?.at ?? 0,
    startTime: moving.find((frame) => frame.motion?.startTime != null)?.motion?.startTime ?? null,
    anchor: SCREEN_ANCHOR,
    lagFrames: lagFramesOf(probe),
    measurePx: SCREEN_READS_DIFFER_BY_DEVICE_PX * (probe.screen?.[0]?.devicePx ?? 1),
  };
}

function attachScreenEvidence(
  probe: StepProbe,
  moving: readonly Frame[],
  motion: ScreenMotion,
  problems: readonly string[],
  what: string,
): void {
  const info = test.info();
  const step = info.attachments.filter((attachment) =>
    attachment.name.startsWith('nfnn-screen-evidence'),
  ).length;
  info.attachments.push({
    name: `nfnn-screen-evidence-${step}.json`,
    contentType: 'application/json',
    body: Buffer.from(
      JSON.stringify(
        {
          what,
          problems,
          judged: {
            from: motion.from,
            to: motion.to,
            curve: motion.curve,
            durationMs: motion.durationMs,
            steadyMs: motion.steadyMs,
            placedAt: motion.placedAt,
            startTime: motion.startTime,
            lagFrames: motion.lagFrames,
            measurePx: motion.measurePx,
            markerY: probe.markerY,
            markedAt: probe.markedAt,
          },
          placedAt: probe.placedAt,
          tappedAt: probe.tappedAt,
          steadyBeforeMs: probe.steadyBeforeMs,
          probeCurve: probe.curve,
          probeDurationMs: probe.durationMs,
          screen: (probe.screen ?? []).map((shot) => ({ at: shot.at, line: shot.offset })),
          frames: moving.map((frame) => ({
            at: frame.at,
            line: frame.offset,
            covered: frame.covered ?? null,
            motion: frame.motion,
          })),
          probeFrames: probe.frames.map((frame) => ({
            at: frame.at,
            offset: frame.offset,
            covered: frame.covered ?? null,
            motion: frame.motion,
          })),
        },
        null,
        1,
      ),
    ),
  });
  const shown = new Set(moving.map((frame) => frame.at));
  (probe.screen ?? [])
    .filter((shot) => shown.has(shot.at) && shot.png !== undefined)
    .forEach((shot) =>
      info.attachments.push({
        name: `nfnn-screen-evidence-${step}-${shot.at.toFixed(1)}ms.png`,
        contentType: 'image/png',
        body: Buffer.from(shot.png!, 'base64'),
      }),
    );
}

function lagFramesOf(probe: StepProbe): number {
  return probe.judged === undefined ? STAMP_LAG_P99_FRAMES : PRODESK_STAMP_LAG_P99_FRAMES;
}

export function movesWithinFramesOfThePlacing(lagFrames: number): number {
  return PACE_FRAMES_AT_MOST + Math.ceil(lagFrames);
}

export function aheadAtMostFrames(lagFrames: number): number {
  return LATE_FRAME_PAST_THE_STEADY_ONE + lagFrames;
}

export function plantedPastMs(lagFrames: number): number {
  return Math.max(
    PLANTED_PAST_MS,
    Math.ceil(PLANTED_PAST_TIMES_THE_TOLERANCE * aheadAtMostFrames(lagFrames) * FRAME_AT_60_HZ_MS),
  );
}

export function plantedStartFramesBeforeThePlacing(lagFrames: number): number {
  return Math.ceil(1 + lagFrames) + 1;
}

export function stampLagsOf(motion: ScreenMotion): number[] {
  if (motion.startTime === null) {
    return [];
  }
  return progressOf(motion)
    .filter((shot) => shot.share >= 0.02 && shot.share <= 0.95)
    .map(
      (shot) =>
        (shot.at -
          motion.startTime! -
          springFractionAt(motion.curve, shot.share) * motion.durationMs) /
        motion.steadyMs,
    );
}

export function screenNotJudgedReason(probe: StepProbe): string | null {
  return screencastMissedTheStep(probe, onTheScreen(probe, travelled(probe)));
}

export function plantedScreenProblemsOf(
  probe: StepProbe,
  from: number,
  way: number,
  what: string,
): string[] {
  expect(probe.screen, 'no screencast was recorded for the step').not.toBeNull();
  const moving = onTheScreen(probe, travelled(probe));
  const motion = screenMotionOf(probe, moving, from, way);
  const problems = judgedOnTheScreen(motion);
  attachScreenEvidence(probe, moving, motion, problems, what);
  return problems;
}

export function screenProblemsOf(probe: StepProbe, from: number, way: number): string[] {
  expect(probe.screen, 'no screencast was recorded for the step').not.toBeNull();
  return judgedOnTheScreen(screenMotionOf(probe, onTheScreen(probe, travelled(probe)), from, way));
}

function expectSteadyFirstHalf(
  probe: StepProbe,
  moving: readonly Frame[],
  from: number,
  way: number,
  what: string,
): void {
  if (!probe.paced || (moving.length === 0 && probe.screen == null)) {
    return;
  }
  if (moving.length === 0) {
    const missed = probe.judged === undefined ? screencastMissedTheStep(probe, moving) : null;
    if (missed !== null) {
      notJudgedOnThisRunner(`the ${what} page`, missed);
      return;
    }
    expect(
      judgedOnTheScreen(screenMotionOf(probe, moving, from, way)),
      `the ${what} page on the screen, frames judged by their time`,
    ).toEqual([]);
    return;
  }
  const motion = moving.find((frame) => frame.motion?.curve != null)?.motion ?? {
    durationMs: probe.durationMs,
    curve: probe.curve,
    startTime: null,
  };
  expect(motion.curve, `no curve is known for the motion of the ${what} page`).not.toBeNull();
  const curve = motion.curve!;
  const durationMs = motion.durationMs;
  const steadyBeforeMs = steadyFrameOf(probe);
  const released = moving.findIndex((frame) => frame.motion?.startTime != null);
  const gapAt = (at: number): number => moving[at].at - moving[at - 1].at;
  const steadyAt = (at: number): number =>
    steadyFrameInMotion(
      steadyBeforeMs,
      released < 0
        ? []
        : Array.from({ length: Math.max(0, at - released - 1) }, (_, index) =>
            gapAt(released + 1 + index),
          ),
    );
  const onePixel = 1 / way;
  const shares = moving.map((frame) => Math.abs(frame.offset! - from) / way);
  const firstStart = moving[released]?.motion?.startTime;
  const paces = moving
    .slice(1)
    .map((frame, before) => {
      const moved = frame.motion?.startTime;
      const shifted = moved == null || firstStart == null ? '?' : (moved - firstStart).toFixed(0);
      const spent = timeSpentIn(probe, moving[before].at);
      return `${gapAt(before + 1).toFixed(0)}/${shifted}/${steadyAt(before + 1).toFixed(1)}/${spent.probeMs.toFixed(1)}/${spent.appMs.toFixed(1)}`;
    })
    .join(' ');
  const firstMoving = shares.findIndex((share) => Math.abs(share - shares[0]) > onePixel);
  const onScreen = probe.screen != null;
  if (onScreen) {
    expect(
      moving
        .filter((frame) => frame.covered != null)
        .map((frame) => `${frame.covered} at ${frame.at.toFixed(0)} ms`),
      `the ${what} page's probe line covered by the chrome while it was measured on the screen`,
    ).toEqual([]);
    const screenMotion = screenMotionOf(probe, moving, from, way);
    const lags = stampLagsOf(screenMotion);
    if (lags.length > 0) {
      test.info().annotations.push({
        type: STAMP_LAG_ANNOTATION,
        description: lags.map((lag) => lag.toFixed(2)).join(' '),
      });
    }
    const missed =
      probe.judged === undefined && framesBetweenRestAndEnd(screenMotion) < 2
        ? screencastMissedTheStep(probe, moving)
        : null;
    if (missed !== null) {
      notJudgedOnThisRunner(`the ${what} page`, missed);
      return;
    }
    const judged = judgedOnTheScreen(screenMotion);
    if (judged.length > 0) {
      attachScreenEvidence(probe, moving, screenMotion, judged, what);
    }
    expect(judged, `the ${what} page on the screen, where the runner captures frames`).toEqual([]);
    if (probe.judged === undefined) {
      return;
    }
    expect(
      frozenOnTheScreen(screenMotion),
      `the ${what} page on the screen (Prodesk/nightly only)`,
    ).toEqual([]);
  }
  for (let at = 1; at < shares.length; at++) {
    const before = shares[at - 1];
    expect(
      shares[at],
      `the ${what} page went back from ${(before * 100).toFixed(1)} % of its way`,
    ).toBeGreaterThanOrEqual(before - onePixel);
    const shownMs = springFractionAt(curve, before) * durationMs;
    if (shownMs >= Math.min(FIRST_HALF_JUDGED_WITHIN_MS, durationMs / 2)) {
      continue;
    }
    if (onScreen && gapAt(at) > LATE_FRAME_PAST_THE_STEADY_ONE * steadyAt(at)) {
      continue;
    }
    const steadyMs = steadyAt(at);
    const oneSteadyFrame = springShareAt(curve, (shownMs + steadyMs) / durationMs) - before;
    const travelledInOneFrame = `share of its way the ${what} page travelled in one frame at ${Math.round(shownMs)} ms of its motion, against one steady frame of ${steadyMs.toFixed(1)} ms (${steadyBeforeMs.toFixed(1)} ms before the step, as the app sampled it; frame gap/start moved so far/steady frame/the probe's reads in the frame before/the app's frame callbacks in the frame before, ms: ${paces})`;
    const budget = LATE_FRAME_PAST_THE_STEADY_ONE * oneSteadyFrame;
    if (at === firstMoving) {
      expect(
        shares[at] - before,
        `${travelledInOneFrame}, in its first moving frame`,
      ).toBeLessThanOrEqual(budget + onePixel);
      continue;
    }
    withinScaledBudget(probe, {
      what: travelledInOneFrame,
      measured: shares[at] - before,
      budget,
      slack: onePixel,
      unit: 'share',
    });
  }
}

function timeSpentIn(probe: StepProbe, at: number): { probeMs: number; appMs: number } {
  const sum = (spent: readonly { at: number; ms: number }[]): number =>
    spent.filter((each) => each.at === at).reduce((all, each) => all + each.ms, 0);
  return { probeMs: sum(probe.sampleCosts), appMs: sum(probe.appCallbacks) };
}

function timeSpentBetween(
  spent: readonly { from: number; ms: number }[],
  from: number,
  until: number,
): number {
  return spent
    .filter((each) => each.from >= from && each.from <= until)
    .reduce((all, each) => all + each.ms, 0);
}

function busyOf(probe: StepProbe, script: LongFrameScript): number {
  if (script.source !== PROBE_SCRIPT) {
    return 0;
  }
  const end = script.startTime + script.durationMs;
  return probe.busy
    .filter((busy) => busy.from >= script.startTime - 1 && busy.to <= end + 1)
    .reduce((all, busy) => all + busy.to - busy.from, 0);
}

function longFramesUntilPlaced(probe: StepProbe): string {
  if (probe.longFrames === null) {
    return 'Long Animation Frames are unavailable in this browser';
  }
  const from = probe.tappedAt!;
  const until = probe.placedAt!;
  const spent = `the probe's own reads took ${timeSpentBetween(probe.sampleCosts, from, until).toFixed(0)} ms and the app's frame callbacks ${timeSpentBetween(probe.appCallbacks, from, until).toFixed(0)} ms between the tap and the placing; the frames below leave out the probe's own busy work (${probe.busy.map((busy) => (busy.to - busy.from).toFixed(0)).join(', ') || 'none'} ms)`;
  const seen = probe.longFrames
    .filter((frame) => frame.startTime + frame.durationMs >= from && frame.startTime <= until)
    .map((frame) => {
      const busyMs = frame.scripts.reduce((all, script) => all + busyOf(probe, script), 0);
      return {
        ...frame,
        durationMs: frame.durationMs - busyMs,
        scripts: frame.scripts.filter((script) => busyOf(probe, script) === 0),
      };
    })
    .filter((frame) => frame.durationMs >= LONG_FRAME_MS);
  if (seen.length === 0) {
    return `no Long Animation Frame between the tap and the placing; ${spent}`;
  }
  const described = seen.map((frame) => {
    const bySource = new Map<string, { ms: number; forcedMs: number }>();
    frame.scripts.forEach((script) => {
      const before = bySource.get(script.source) ?? { ms: 0, forcedMs: 0 };
      bySource.set(script.source, {
        ms: before.ms + script.durationMs,
        forcedMs: before.forcedMs + script.forcedStyleAndLayoutMs,
      });
    });
    const frameEnd = frame.startTime + frame.durationMs;
    const scripts =
      [...bySource]
        .map(([source, { ms, forcedMs }]) => {
          const inside =
            source === PROBE_SCRIPT
              ? `, of which the app's frame callbacks it calls ${timeSpentBetween(probe.appCallbacks, frame.startTime, frameEnd).toFixed(0)} ms`
              : '';
          return `${source} ${ms.toFixed(0)} ms (forced style and layout ${forcedMs.toFixed(0)} ms${inside})`;
        })
        .join(', ') || 'none';
    return `at ${(frame.startTime - from).toFixed(0)} ms for ${frame.durationMs.toFixed(0)} ms (scripts by source: ${scripts}; style and layout ${frame.styleAndLayoutMs.toFixed(0)} ms; blocking ${frame.blockingMs.toFixed(0)} ms)`;
  });
  return `Long Animation Frames between the tap and the placing: ${described.join('; ')}; ${spent}`;
}

export interface Placing {
  readonly frames: number;
  readonly gapsMs: readonly number[];
  readonly probeMs: readonly number[];
  readonly steadyMs: number;
  readonly ms: number;
  readonly loadedCode: boolean;
}

export function placingOf(probe: StepProbe): Placing {
  const tappedAt = probe.tappedAt!;
  const placedAt = probe.placedAt!;
  const seen = probe.frames.filter((frame) => frame.readAt <= placedAt);
  const afterTheTap = seen.filter((frame) => frame.readAt > tappedAt);
  const before = seen.filter((frame) => frame.readAt <= tappedAt).at(-1);
  const times = [
    ...(before === undefined ? [] : [before.at]),
    ...afterTheTap.map((frame) => frame.at),
  ];
  const ends = [...times, ...(times.length === 0 ? [] : [placedAt])];
  const spans = ends.slice(1).map((end, index) => ({ from: ends[index], end }));
  return {
    frames: afterTheTap.length,
    gapsMs: spans.map(({ from, end }) => end - from),
    probeMs: spans.map(({ from, end }) => probeReadsWithin(probe, from, end)),
    steadyMs: probe.steadyBeforeMs ?? steadyFrameBeforeTheTap(probe),
    ms: placedAt - tappedAt,
    loadedCode: probe.loadedCode,
  };
}

function probeReadsWithin(probe: StepProbe, from: number, end: number): number {
  return probe.sampleCosts
    .filter((cost) => cost.from >= from && cost.from < end)
    .reduce((all, cost) => all + Math.min(cost.ms, end - cost.from), 0);
}

function steadyFrameBeforeTheTap(probe: StepProbe): number {
  const before = probe.frames.filter((frame) => frame.readAt <= probe.tappedAt!);
  return steadyFrameMs(before.slice(1).map((frame, index) => frame.at - before[index].at));
}

function gapsOf(placing: Placing): string {
  const gaps = placing.gapsMs
    .map(
      (gap, index) => `${gap.toFixed(1)} (the probe's reads ${placing.probeMs[index].toFixed(1)})`,
    )
    .join(', ');
  return `frame gaps from the last frame before the tap to the placing, ms: ${gaps}; ${placing.ms.toFixed(0)} ms in all`;
}

export function placingProblems(placing: Placing): string[] {
  const within = placing.loadedCode ? FIRST_OPENING_PLACED_WITHIN_FRAMES : PLACED_WITHIN_FRAMES;
  return placing.frames <= within
    ? []
    : [
        `both copies were placed after ${placing.frames} frames drawn since the tap, against ${within}${placing.loadedCode ? ' while the page’s code loads' : ''} (${gapsOf(placing)})`,
      ];
}

export function longFrameProblems(placing: Placing): string[] {
  const longestMs = LONGEST_FRAME_BEFORE_PLACING * placing.steadyMs;
  const appMs = placing.gapsMs.map((gap, index) => gap - placing.probeMs[index]);
  const longest = appMs.indexOf(Math.max(...appMs));
  return appMs.every((ms) => ms <= longestMs)
    ? []
    : [
        `the app's own work in a frame between the tap and the placing lasted ${appMs[longest].toFixed(1)} ms (${placing.gapsMs[longest].toFixed(1)} ms less the probe's own reads of ${placing.probeMs[longest].toFixed(1)} ms), longer than ${LONGEST_FRAME_BEFORE_PLACING} steady frames of ${placing.steadyMs.toFixed(1)} ms (${gapsOf(placing)})`,
      ];
}

export function expectWithinTheBudget(probe: StepProbe, restingAt?: number): void {
  const moving = travelled(probe);
  const tappedAt = probe.tappedAt;
  expect(tappedAt, 'the tap was not seen').not.toBeNull();
  expect(probe.placedAt, 'the step never placed both copies').not.toBeNull();
  const placing = placingOf(probe);
  test.info().annotations.push({ type: PLACING_ANNOTATION, description: JSON.stringify(placing) });
  if (probe.judged === undefined) {
    expect(placingProblems(placing), longFramesUntilPlaced(probe)).toEqual([]);
  } else {
    if (slowedForTheKnownDefect()) {
      expect(longFrameProblems(placing), longFramesUntilPlaced(probe)).toEqual([]);
    }
    withinScaledBudget(probe, {
      what: `ms from the tap until both copies were placed${probe.loadedCode ? ', loading the code of the page' : ''}; ${longFramesUntilPlaced(probe)}`,
      measured: placing.ms,
      budget: probe.loadedCode ? FIRST_OPENING_PLACED_WITHIN_MS : PLACED_AFTER_THE_TAP_WITHIN_MS,
      unit: 'ms',
    });
  }
  const shown = onTheScreen(probe, moving);
  const moved = shown.length === 0 ? null : firstMovedFrame(shown, restingAt ?? shown[0].offset!);
  const missed =
    moved === null && probe.judged === undefined ? screencastMissedTheStep(probe, moving) : null;
  if (missed !== null) {
    notJudgedOnThisRunner('the first move of the page', missed);
    return;
  }
  expect(shown.length, 'no frame on the screen showed the moving page placed').toBeGreaterThan(0);
  expect(moved, 'the page never moved').not.toBeNull();
  const busyFrameAt = probe.busyFrameAt;
  expect(busyFrameAt, 'no frame was drawn after both copies were placed').not.toBeNull();
  const framesBefore = probe.frames.filter(
    (frame) => frame.at > probe.placedAt! && frame.at < moved!.at,
  ).length;
  expect(
    framesBefore,
    'frames drawn between the placing and the first frame on the screen in which the page moved',
  ).toBeLessThanOrEqual(movesWithinFramesOfThePlacing(lagFramesOf(probe)));
}

function expectEndedOnTheLiveTitle(page: Page, probe: StepProbe): void {
  if (!probe.paced) {
    return;
  }
  const lastShown = probe.frames.map((frame) => frame.overlay).lastIndexOf(true);
  if (lastShown < 0) {
    return;
  }
  const last = probe.frames[lastShown];
  const arrivesLater = TITLE_ARRIVES_LATER.test(new URL(page.url()).pathname);
  const seen = {
    titles: probe.frames.slice(lastShown + 1).map((frame) => frame.live),
    heading: probe.heading,
    settled: probe.settled,
  };
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
  return probeSoFar(page);
}

function expectShownOnItsWay(
  probe: StepProbe,
  between: readonly Frame[],
  least: number,
  message: string,
): void {
  if (probe.paced && probe.judged !== undefined) {
    expect(between.length, message).toBeGreaterThanOrEqual(least);
  }
}

function expectFirstShownNear(
  probe: StepProbe,
  moving: readonly Frame[],
  near: (offset: number) => void,
): void {
  if (probe.paced && !(probe.screen != null && probe.judged === undefined)) {
    expect(moving.length, 'no frame showed the moving page placed').toBeGreaterThan(0);
    near(moving[0].offset!);
  }
}

export function expectLeftAway(probe: StepProbe, width: number, from: number): void {
  const travelledFrames = travelled(probe);
  const between = travelledFrames.filter((frame) => frame.offset! > 1 && frame.offset! < width - 1);
  expectShownOnItsWay(probe, between, 2, 'no frame showed the leaving page on its way');
  const moving = onTheScreen(probe, travelledFrames);
  expectFirstShownNear(probe, moving, (offset) =>
    expect(offset, 'px the leaving page had gone in its first frame').toBeLessThanOrEqual(
      from + width * FIRST_SHOWN_AT_MOST,
    ),
  );
  expectSteadyFirstHalf(probe, moving, from, width - from, 'leaving');
  for (let at = 1; at < travelledFrames.length; at++) {
    expect(
      travelledFrames[at].offset!,
      'the leaving page went back on its way',
    ).toBeGreaterThanOrEqual(travelledFrames[at - 1].offset! - 1);
  }
  expectNoJump(probe, travelledFrames, width);
  expectOneTitleAtATime(probe);
}

export function expectArrived(probe: StepProbe, width: number): void {
  const travelledFrames = travelled(probe);
  const between = travelledFrames.filter((frame) => frame.offset! > 1 && frame.offset! < width - 1);
  expectShownOnItsWay(probe, between, 2, 'no frame showed the arriving page on its way');
  const moving = onTheScreen(probe, travelledFrames);
  expectFirstShownNear(probe, moving, (offset) =>
    expect(
      offset,
      'px the arriving page was from its place in its first frame',
    ).toBeGreaterThanOrEqual(width * (1 - FIRST_SHOWN_AT_MOST)),
  );
  expectSteadyFirstHalf(probe, moving, width, width, 'arriving');
  for (let at = 1; at < travelledFrames.length; at++) {
    expect(
      travelledFrames[at].offset!,
      'the arriving page went back on its way',
    ).toBeLessThanOrEqual(travelledFrames[at - 1].offset! + 1);
  }
  expectNoJump(probe, travelledFrames, width);
  expectOneTitleAtATime(probe);
}

export function expectSlidBack(probe: StepProbe, width: number, from: number): void {
  const travelledFrames = travelled(probe);
  const moving = onTheScreen(probe, travelledFrames);
  expectFirstShownNear(probe, moving, (offset) =>
    expect(offset, 'px the page had come back in its first frame').toBeGreaterThanOrEqual(
      from * (1 - FIRST_SHOWN_AT_MOST),
    ),
  );
  const between = moving.filter((frame) => frame.offset! > 1 && frame.offset! < from - 1);
  expectShownOnItsWay(probe, between, 1, 'no frame showed the page on its way back');
  for (let at = 1; at < travelledFrames.length; at++) {
    expect(
      travelledFrames[at].offset!,
      'the page went away again on its way back',
    ).toBeLessThanOrEqual(travelledFrames[at - 1].offset! + 1);
  }
  expectNoJump(probe, travelledFrames, width);
  expectOneTitleAtATime(probe);
}

interface Colour {
  readonly mean: readonly number[];
  readonly spread: readonly number[];
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
    const sum = [0, 0, 0];
    for (let at = 0; at < data.length; at += 4) {
      for (let channel = 0; channel < 3; channel++) {
        low[channel] = Math.min(low[channel], data[at + channel]);
        high[channel] = Math.max(high[channel], data[at + channel]);
        sum[channel] += data[at + channel];
      }
    }
    const pixels = data.length / 4;
    return {
      mean: sum.map((total) => total / pixels),
      spread: high.map((most, channel) => most - low[channel]),
    };
  }, Array.from(shot));
  return spread;
}

function expectSameColour(seen: Colour, before: Colour, when: string): void {
  const apart = (one: readonly number[], other: readonly number[]): number =>
    Math.max(...one.map((value, channel) => Math.abs(value - other[channel])));
  expect(
    apart(seen.mean, before.mean),
    `the background above the sheets changed its colour ${when}`,
  ).toBeLessThanOrEqual(SAME_COLOUR);
  expect(
    apart(seen.spread, before.spread),
    `the background above the sheets changed what it shows ${when}`,
  ).toBeLessThanOrEqual(SAME_SPREAD);
}

export interface Screens {
  readonly sheets: boolean;
  shown(row: Row): Promise<void>;
  backButton(): Locator;
  returned(row: Row): Promise<void>;
  scrollTop(): Promise<number>;
  scrollTo(top: number): Promise<number>;
  readonly scroller?: string;
}

interface Swiped {
  readonly probe: StepProbe;
  readonly letGoAt: number;
}

export async function swipeBack(
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
  const probe = await stepSeen(page);
  if (measuresFrames(page)) {
    expect(
      probe.markedAt,
      'the probe never marked the page the finger let go, so the screen could not judge its way',
    ).toBeDefined();
  }
  return { probe, letGoAt: letGoAt - EDGE };
}

async function stepBackFrom(page: Page, screens: Screens, row: Row, way: Way): Promise<void> {
  const ground =
    onTheSheetGround(screens, row) && !groundChangesWithTheScrim(row)
      ? await bandColour(page)
      : null;
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
    expectEndedOnTheLiveTitle(page, probe);
    return;
  }
  const completes = way === 'swipe-completed';
  const { probe, letGoAt } = await swipeBack(page, row, completes, ground);
  if (completes) {
    expectLeftAway(probe, WIDTH, letGoAt);
  } else {
    expectSlidBack(probe, WIDTH, letGoAt);
  }
  expectEndedOnTheLiveTitle(page, probe);
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export async function activeHref(page: Page): Promise<string | null> {
  return page.evaluate(() => document.activeElement?.getAttribute('href') ?? null);
}

export async function walkRow(
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
  expectEndedOnTheLiveTitle(page, opening);
  if (groundBefore !== null && !groundChangesWithTheScrim(row)) {
    expectSameColour(await bandColour(page), groundBefore, 'when the next screen opened');
  }
  await watchTheScroll(page, row.href, !measuresFrames(page), screens.scroller ?? null);
  try {
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
    await followTheKeptRow(page);
    await expect
      .poll(() => activeHref(page), { message: 'the focus did not return' })
      .toBe(row.href);
    if (shownBefore) {
      await expectScrollKept(page, screens, row, top, way, scrolled);
    } else {
      await expectBroughtIntoViewTheLeast(page);
    }
  } finally {
    await stopWatchingTheScroll(page);
  }
  if (groundBefore !== null) {
    expectSameColour(await bandColour(page), groundBefore, 'after the step back');
  }
}

export interface ScrollNote {
  readonly at: number;
  readonly what: string;
  readonly scrollY: number;
  readonly held?: number;
  readonly lifted?: boolean;
  readonly detail: string;
}

interface ScrollWatch {
  readonly notes: ScrollNote[];
  follow(): void;
  stop(): void;
}

type ScrollWatched = Window & { nfnnScrollWatch?: ScrollWatch };

async function watchTheScroll(
  page: Page,
  href: string,
  everyFrame: boolean,
  scroller: string | null,
): Promise<void> {
  await page.evaluate(
    ({ href, everyFrame, scroller }) => {
      const own = window as ScrollWatched;
      own.nfnnScrollWatch?.stop();
      const notes: ScrollNote[] = [];
      const describe = (element: Element | null): string => {
        if (element === null) {
          return 'none';
        }
        const id = element.id === '' ? '' : `#${element.id}`;
        const classes = [...element.classList]
          .slice(0, 3)
          .map((name) => `.${name}`)
          .join('');
        const link = element.getAttribute('href');
        return `${element.tagName.toLowerCase()}${id}${classes}${link === null ? '' : `[href=${link}]`}`;
      };
      const held = (): number =>
        scroller === null
          ? window.scrollY
          : (document.querySelector(scroller)?.scrollTop ?? Number.NaN);
      const root = document.documentElement.style;
      const note = (what: string, detail = ''): void => {
        notes.push({
          at: performance.now(),
          what,
          scrollY: window.scrollY,
          held: held(),
          lifted: root.scrollPaddingTop === '0px' || root.scrollPaddingBottom === '0px',
          detail,
        });
      };
      const caller = (): string =>
        (new Error().stack ?? '')
          .split('\n')
          .slice(2, 6)
          .map((line) => line.trim())
          .join(' < ');
      const kept = (): Element | null =>
        document.querySelector(`.admin-frame a[href="${href}"]`) ??
        document.querySelector(`a[href="${href}"]`);
      const rowTop = (): string => {
        const row = kept();
        return row === null
          ? 'row absent'
          : `row at ${Math.round(row.getBoundingClientRect().top)}`;
      };
      const onScroll = (event: Event): void =>
        note(
          'scroll',
          `${event.target instanceof Element ? describe(event.target) : 'document'}, ${rowTop()}, page ${document.documentElement.scrollHeight} high`,
        );
      const onResize = (): void =>
        note('resize', `${innerWidth}x${innerHeight}, visual ${visualViewport?.height ?? '?'}`);
      const onFocus = (event: FocusEvent): void => {
        note(
          'focus',
          `${describe(event.target instanceof Element ? event.target : null)}, ${rowTop()}`,
        );
        if (event.target instanceof Element && event.target === kept()) {
          startSampling();
        }
      };
      addEventListener('scroll', onScroll, { capture: true, passive: true });
      addEventListener('resize', onResize);
      visualViewport?.addEventListener('resize', onResize);
      document.addEventListener('focusin', onFocus, true);
      const scrollBy = window.scrollBy;
      const scrollTo = window.scrollTo;
      const scrollIntoView = Element.prototype.scrollIntoView;
      const scrollTop = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')!;
      window.scrollBy = function (this: Window, ...args: unknown[]): void {
        note('scrollBy', `${JSON.stringify(args)} from ${caller()}`);
        (scrollBy as (...all: unknown[]) => void).apply(this, args);
      } as typeof window.scrollBy;
      window.scrollTo = function (this: Window, ...args: unknown[]): void {
        note('scrollTo', `${JSON.stringify(args)} from ${caller()}`);
        (scrollTo as (...all: unknown[]) => void).apply(this, args);
      } as typeof window.scrollTo;
      Element.prototype.scrollIntoView = function (
        this: Element,
        ...args: Parameters<Element['scrollIntoView']>
      ): void {
        note('scrollIntoView', `${describe(this)} ${JSON.stringify(args)} from ${caller()}`);
        scrollIntoView.apply(this, args);
      };
      Object.defineProperty(Element.prototype, 'scrollTop', {
        ...scrollTop,
        set(this: Element, value: number) {
          if (this === document.scrollingElement || this === document.body) {
            note('scrollTop', `${describe(this)} = ${value} from ${caller()}`);
          }
          scrollTop.set!.call(this, value);
        },
      });
      let sampling = false;
      const sample = (): void => {
        if (!sampling) {
          return;
        }
        note('frame', `focus ${describe(document.activeElement)}`);
        requestAnimationFrame(sample);
      };
      const startSampling = (): void => {
        if (!sampling) {
          sampling = true;
          requestAnimationFrame(sample);
        }
      };
      let sizes: ResizeObserver | null = null;
      if (everyFrame) {
        startSampling();
      }
      own.nfnnScrollWatch = {
        notes,
        follow: () => {
          startSampling();
          sizes?.disconnect();
          sizes = new ResizeObserver((entries) =>
            entries.forEach((entry) =>
              note(
                'layout',
                `${describe(entry.target)} ${Math.round(entry.contentRect.height)} px high, top ${Math.round(entry.target.getBoundingClientRect().top)}`,
              ),
            ),
          );
          for (let element = kept(); element !== null; element = element.parentElement) {
            sizes.observe(element);
            for (
              let before = element.previousElementSibling;
              before !== null;
              before = before.previousElementSibling
            ) {
              sizes.observe(before);
            }
          }
        },
        stop: () => {
          sampling = false;
          sizes?.disconnect();
          removeEventListener('scroll', onScroll, { capture: true });
          removeEventListener('resize', onResize);
          visualViewport?.removeEventListener('resize', onResize);
          document.removeEventListener('focusin', onFocus, true);
          window.scrollBy = scrollBy;
          window.scrollTo = scrollTo;
          Element.prototype.scrollIntoView = scrollIntoView;
          Object.defineProperty(Element.prototype, 'scrollTop', scrollTop);
          delete own.nfnnScrollWatch;
        },
      };
    },
    { href, everyFrame, scroller },
  );
}

function followTheKeptRow(page: Page): Promise<void> {
  return page.evaluate(() => (window as ScrollWatched).nfnnScrollWatch?.follow());
}

async function stopWatchingTheScroll(page: Page): Promise<void> {
  await page
    .evaluate(() => (window as ScrollWatched).nfnnScrollWatch?.stop())
    .catch(() => undefined);
}

function focusReturned(notes: readonly ScrollNote[], href: string): ScrollNote | undefined {
  return notes.find((note) => note.what === 'focus' && note.detail.includes(`[href=${href}]`));
}

export function framesAwayFromTheKeptScroll(
  notes: readonly ScrollNote[],
  href: string,
  top: number,
): string[] {
  const focused = focusReturned(notes, href);
  if (focused === undefined) {
    return ['the focus never returned to the row while the scroll was watched'];
  }
  const after = notes.filter((note) => note.at >= focused.at && note !== focused);
  if (!after.some((note) => note.what === 'frame')) {
    return [
      'no frame was sampled after the focus returned, so no frame of the kept scroll was judged',
    ];
  }
  return after
    .filter((note) => note.what === 'frame' || note.what === 'scroll')
    .map((note) => ({ note, stood: Math.round(note.held ?? note.scrollY) }))
    .filter(({ stood }) => stood !== top)
    .map(
      ({ note, stood }) =>
        `the page stood at ${stood} px instead of ${top} px in ${note.what === 'frame' ? 'the frame' : 'a scroll'} ${Math.round(note.at - focused.at)} ms after the focus returned`,
    );
}

export function scrollWatchSettled(notes: readonly ScrollNote[], href: string): boolean {
  const focused = focusReturned(notes, href);
  if (focused === undefined) {
    return false;
  }
  const after = notes.filter((note) => note.at >= focused.at && note !== focused);
  const lastLifted = after.filter((note) => note.lifted === true).at(-1)?.at ?? focused.at;
  return after.some(
    (note) => note.what === 'frame' && note.lifted !== true && note.at > lastLifted,
  );
}

async function expectScrollKept(
  page: Page,
  screens: Screens,
  row: Row,
  top: number,
  way: Way,
  scrolled: boolean,
): Promise<void> {
  const attachEvidence = async (): Promise<void> => {
    const notes = await page.evaluate(() => (window as ScrollWatched).nfnnScrollWatch?.notes ?? []);
    const info = test.info();
    const step = info.attachments.filter((attachment) =>
      attachment.name.startsWith('nfnn-scroll-evidence'),
    ).length;
    info.attachments.push({
      name: `nfnn-scroll-evidence-${step}.json`,
      contentType: 'application/json',
      body: Buffer.from(
        JSON.stringify(
          { row, way, scrolled, keptTop: top, scrollY: await screens.scrollTop(), notes },
          null,
          1,
        ),
      ),
    });
  };
  try {
    await expect.poll(() => screens.scrollTop(), { message: 'the scroll was not kept' }).toBe(top);
  } catch (failure) {
    await attachEvidence();
    throw failure;
  }
  const watched = (): Promise<ScrollNote[]> =>
    page.evaluate(() => (window as ScrollWatched).nfnnScrollWatch?.notes ?? []);
  try {
    await expect
      .poll(async () => scrollWatchSettled(await watched(), row.href), {
        message: 'no frame was sampled after the band lifted for the returned focus was given back',
        timeout: SCROLL_SETTLES_WITHIN_MS,
      })
      .toBe(true);
  } catch (failure) {
    await attachEvidence();
    throw failure;
  }
  const notes = await watched();
  const away = framesAwayFromTheKeptScroll(notes, row.href, top);
  if (away.length > 0) {
    await attachEvidence();
  }
  expect(away, 'frames after the focus returned in which the page left its kept scroll').toEqual(
    [],
  );
}

interface Placement {
  readonly shown: boolean;
  readonly atAnEdge: boolean;
}

export async function placementOf(target: Locator): Promise<Placement> {
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
  const style = getComputedStyle(element);
  const marginTop = parseFloat(style.scrollMarginTop) || 0;
  const marginBottom = parseFloat(style.scrollMarginBottom) || 0;
  const scrolling = scroller ?? document.documentElement;
  const atAnEnd =
    scrolling.scrollTop <= 0 ||
    scrolling.scrollTop >= scrolling.scrollHeight - scrolling.clientHeight - 1;
  return {
    shown: box.bottom > band.top && box.top < band.bottom,
    atAnEdge:
      atAnEnd ||
      Math.abs(box.top - marginTop - band.top) <= 1 ||
      Math.abs(box.bottom + marginBottom - band.bottom) <= 1,
  };
}

export async function expectBroughtIntoViewTheLeast(page: Page): Promise<void> {
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

export function rowLink(page: Page, row: Row): Locator {
  return page.locator(`.admin-frame a[href="${row.href}"]`).first();
}

export function clickWithoutScrolling(link: Locator): Promise<void> {
  return link.evaluate((element: HTMLElement) => element.click());
}

export function accountSheet(page: Page): Locator {
  return page.locator('app-account-sheet').getByRole('dialog');
}

export async function accountListShown(page: Page): Promise<void> {
  await expect(accountSheet(page).getByRole('heading', { level: 2, name: 'Účet' })).toBeVisible();
}

export async function openAccountSheetOverTheNews(page: Page): Promise<void> {
  await page.goto('/aktuality');
  await expect(page.getByRole('heading', { name: 'Zpráva 8' })).toBeVisible();
  await page.getByRole('banner').getByRole('button', { name: 'Účet' }).dispatchEvent('click');
  await accountListShown(page);
  await expect(page.locator('.page-transition')).toHaveCount(0);
  await sheetSettled(page);
}

export function motionsEnded(page: Page): Promise<unknown> {
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

export function sheetSettled(page: Page): Promise<unknown> {
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

export async function accountRows(page: Page): Promise<Row[]> {
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

export function accountScreens(page: Page): Screens & { opening(row: Row): void } {
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
    scroller: 'app-account-sheet dialog .dialog-panel',
    scrollTop: () => sheetPanel(page).evaluate((panel) => Math.round(panel.scrollTop)),
    scrollTo: (top) =>
      sheetPanel(page).evaluate((panel, wanted) => {
        panel.scrollTop = Math.min(wanted, panel.scrollHeight - panel.clientHeight);
        return Math.round(panel.scrollTop);
      }, top),
  };
}

export const ACCOUNT_LIST_ROW: Row = { name: 'Účet', href: '/darce/potvrzeni', from: 'Účet' };

export async function backOnASectionLeftFromTheScrolledList(
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

export async function recordTheListScrollsUnderTheSection(page: Page): Promise<void> {
  await evaluateAsProbe(
    page,
    () => {
      const seen: number[] = [];
      window.nfnnListScrolls = seen;
      (window.nfnnFrameReaders ??= {}).listScrolls = {
        read: () => {
          const under = document.querySelector<HTMLElement>(
            '.page-transition .page-transition__page--under .dialog-panel',
          );
          if (under !== null) {
            seen.push(Math.round(under.scrollTop));
          }
          return seen.length < 600;
        },
        inFrame: true,
      };
    },
    null,
  );
  await sampleFrames(page, { readers: ['listScrolls'] });
}

export async function recordTheSheetTops(page: Page): Promise<void> {
  await evaluateAsProbe(
    page,
    () => {
      const seen: number[] = [];
      window.nfnnSheetTops = seen;
      (window.nfnnFrameReaders ??= {}).sheetTops = {
        read: () => {
          const panel = document.querySelector('app-account-sheet .dialog-panel');
          if (panel === null) {
            return false;
          }
          seen.push(panel.getBoundingClientRect().top);
          return true;
        },
        inFrame: true,
      };
    },
    null,
  );
  await sampleFrames(page, { readers: ['sheetTops'] });
}

export function sheetTopsSeen(page: Page): Promise<number[]> {
  return page.evaluate(() => window.nfnnSheetTops ?? []);
}

export async function expectTheListUnderTheSectionAt(page: Page, listTop: number): Promise<void> {
  const seen = await page.evaluate(() => window.nfnnListScrolls ?? []);
  expect(seen.length, 'no frame showed the list under the leaving section').toBeGreaterThan(0);
  expect(
    seen.filter((top) => top !== listTop),
    'frames in which the list under the leaving section stood elsewhere than its scroll',
  ).toEqual([]);
}

export function pageScroll(page: Page): Pick<Screens, 'scrollTop' | 'scrollTo'> {
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

export function administrationScreensOf(page: Page): Screens {
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

export async function linksOut(under: string, within: Locator, from = under): Promise<Row[]> {
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

export interface PlannedRow {
  readonly trail: readonly string[];
  readonly row: Row;
}

export async function plannedAdministrationWalk(
  page: Page,
  screens: Screens,
): Promise<PlannedRow[]> {
  const frame = page.locator('.admin-frame');
  await openAdministrationAt(page, ['/sprava']);
  const origins: { trail: readonly string[]; rows: Row[] }[] = [
    { trail: ['/sprava'], rows: await linksOut('/sprava', frame) },
  ];
  const known = (href: string): boolean =>
    origins.some((origin) => origin.rows.some((row) => row.href === href));
  const seen = new Set<string>();
  const plan: PlannedRow[] = [];
  for (const origin of origins) {
    for (const row of origin.rows) {
      if (seen.has(row.href)) {
        continue;
      }
      seen.add(row.href);
      plan.push({ trail: origin.trail, row });
      if (origin.trail.length >= 3) {
        continue;
      }
      await openAdministrationAt(page, origin.trail);
      await clickWithoutScrolling(rowLink(page, row));
      await screens.shown(row);
      const deeper = [
        ...(await linksOut(row.href, frame)),
        ...(await linksOut('/sprava', frame, row.href)).filter((link) => !known(link.href)),
      ];
      if (deeper.length > 0) {
        origins.push({ trail: [...origin.trail, row.href], rows: deeper });
      }
    }
  }
  return plan;
}

export async function openAdministrationAt(page: Page, trail: readonly string[]): Promise<void> {
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
