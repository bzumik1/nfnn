export interface Rect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface LandingView {
  staged: boolean;
  scrollY: number;
  restingScroll: number;
  bleedBottom: number;
  width: number;
  height: number;
  heroHeight: number;
  photo: Rect | null;
  marks: Record<string, Rect | null>;
  moves: number[];
}

export const LANDING_MOVES_GLOBAL = '__nfnnLandingMoves';

const STILL_FRAMES = 12;
const STILL_TIMEOUT_MS = 3_000;

export function landingView(movesGlobal: string): LandingView {
  const rect = (element: Element | null): Rect | null => {
    if (!element) {
      return null;
    }
    const box = element.getBoundingClientRect();
    return {
      top: Math.round(box.top),
      bottom: Math.round(box.bottom),
      left: Math.round(box.left),
      right: Math.round(box.right),
    };
  };
  const root = document.documentElement;
  const style = getComputedStyle(root);
  const pixels = (name: string) => Number.parseFloat(style.getPropertyValue(name)) || 0;
  const recorded = (window as unknown as Record<string, number[] | undefined>)[movesGlobal];
  return {
    staged: root.classList.contains('landing-stage'),
    scrollY: Math.round(window.scrollY),
    restingScroll: pixels('--page-resting-scroll'),
    bleedBottom: pixels('--page-bleed-bottom'),
    width: window.innerWidth,
    height: window.innerHeight,
    heroHeight: Math.round(document.querySelector('#uvod')?.getBoundingClientRect().height ?? 0),
    photo: rect(document.querySelector('#uvod img')),
    marks: {
      logo: rect(document.querySelector('app-header .brand')),
      heading: rect(document.querySelector('#uvod h1')),
      'tab bar': rect(document.querySelector('app-tab-bar nav')),
    },
    moves: recorded ?? [],
  };
}

export function recordMoves(movesGlobal: string): void {
  const moves: number[] = [];
  (window as unknown as Record<string, number[]>)[movesGlobal] = moves;
  const record = () => moves.push(Math.round(window.scrollY));
  window.addEventListener('scroll', record, { passive: true });
  window.visualViewport?.addEventListener('scroll', record, { passive: true });
}

export async function untilStill(frames: number, timeoutMs: number): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  const look = () =>
    JSON.stringify([
      window.scrollY,
      window.innerHeight,
      window.visualViewport?.offsetTop,
      document.querySelector('#uvod')?.getBoundingClientRect().top,
    ]);
  let last = look();
  let same = 0;
  while (same < frames && performance.now() < deadline) {
    await new Promise((frame) => requestAnimationFrame(() => frame(undefined)));
    const now = look();
    same = now === last ? same + 1 : 0;
    last = now;
  }
}

export const LANDING_VIEW = `return (${landingView.toString()})(arguments[0]);`;
export const RECORD_MOVES = `(${recordMoves.toString()})(arguments[0]);`;
export const UNTIL_STILL = `const done = arguments[arguments.length - 1]; (${untilStill.toString()})(${STILL_FRAMES}, ${STILL_TIMEOUT_MS}).then(() => done());`;

export function swipe(x: number, fromY: number, toY: number) {
  return {
    actions: [
      {
        type: 'pointer',
        id: 'finger',
        parameters: { pointerType: 'touch' },
        actions: [
          { type: 'pointerMove', duration: 0, x: Math.round(x), y: Math.round(fromY) },
          { type: 'pointerDown', button: 0 },
          { type: 'pointerMove', duration: 250, x: Math.round(x), y: Math.round(toY) },
          { type: 'pointerUp', button: 0 },
        ],
      },
    ],
  };
}

const PAGE_DOWN = '';
const ARROW_DOWN = '';
const END = '';

export function scrollKeys() {
  return {
    actions: [
      {
        type: 'key',
        id: 'keyboard',
        actions: [PAGE_DOWN, ' ', ARROW_DOWN, END].flatMap((value) => [
          { type: 'keyDown', value },
          { type: 'keyUp', value },
        ]),
      },
    ],
  };
}
