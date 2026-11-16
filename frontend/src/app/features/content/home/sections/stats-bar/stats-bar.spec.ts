import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StatsBar } from './stats-bar';

type Sighting = (
  entries: Pick<IntersectionObserverEntry, 'isIntersecting' | 'boundingClientRect'>[],
) => void;

class FakeIntersectionObserver {
  static all: FakeIntersectionObserver[] = [];
  observed: Element[] = [];

  constructor(
    readonly sighting: Sighting,
    readonly options: IntersectionObserverInit,
  ) {
    FakeIntersectionObserver.all.push(this);
  }

  observe(element: Element): void {
    this.observed.push(element);
  }

  disconnect(): void {}
}

interface Count {
  readonly options: KeyframeAnimationOptions;
  readonly started: number;
  cancelled: boolean;
}

const counts: Count[] = [];

function fakeAnimate(this: Element, _keyframes: Keyframe[], options: KeyframeAnimationOptions) {
  const count: Count = { options, started: performance.now(), cancelled: false };
  counts.push(count);
  const duration = Number(options.duration);
  return {
    effect: {
      getComputedTiming: () => ({
        progress: Math.min(1, (performance.now() - count.started) / duration),
      }),
    },
    cancel: () => {
      count.cancelled = true;
    },
  } as unknown as Animation;
}

const VIEWPORT_HEIGHT = 800;
const COUNT_AND_A_FRAME = 800 + 16;
const BELOW_THE_SCREEN = VIEWPORT_HEIGHT + 200;
const FINAL = ['21', '200+', '100%', '2005'];
const FROM_SEVENTY_PERCENT = ['15', '140+', '100%', '2005'];

describe('Given the figures', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete (Element.prototype as { animate?: unknown }).animate;
    document.documentElement.style.removeProperty('--duration-count');
    document.documentElement.style.removeProperty('--ease-out');
    FakeIntersectionObserver.all = [];
    counts.length = 0;
  });

  async function renderOn(
    day: string,
    { top = 0, ownEntrance = true }: { top?: number; ownEntrance?: boolean } = {},
  ): Promise<ComponentFixture<StatsBar>> {
    vi.useFakeTimers({
      toFake: [
        'Date',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'performance',
        'setTimeout',
      ],
    });
    vi.setSystemTime(new Date(day));
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(rectAt(top));
    await TestBed.configureTestingModule({ imports: [StatsBar] }).compileComponents();
    const fixture = TestBed.createComponent(StatsBar);
    fixture.componentRef.setInput('ownEntrance', ownEntrance);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  function stats(fixture: ComponentFixture<StatsBar>): HTMLElement[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.stat'));
  }

  function shown(fixture: ComponentFixture<StatsBar>): string[] {
    return stats(fixture).map(
      (stat) => stat.querySelector('.stat-value [aria-hidden="true"]')?.textContent?.trim() ?? '',
    );
  }

  function read(fixture: ComponentFixture<StatsBar>): string[] {
    return stats(fixture).map(
      (stat) => stat.querySelector('.stat-value .visually-hidden')?.textContent?.trim() ?? '',
    );
  }

  function hidden(fixture: ComponentFixture<StatsBar>): boolean[] {
    return stats(fixture).map(
      (stat) =>
        stat.classList.contains('motion-reveal') &&
        !stat.classList.contains('motion-reveal--shown'),
    );
  }

  function allowMotion({ reduced = false }: { reduced?: boolean } = {}): void {
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: reduced && query === '(prefers-reduced-motion: reduce)',
    }));
    vi.stubGlobal('innerHeight', VIEWPORT_HEIGHT);
    Object.defineProperty(Element.prototype, 'animate', {
      configurable: true,
      writable: true,
      value: fakeAnimate,
    });
    document.documentElement.style.setProperty('--duration-count', '0.8s');
    document.documentElement.style.setProperty('--ease-out', 'cubic-bezier(0.22, 0.61, 0.36, 1)');
  }

  async function wait(fixture: ComponentFixture<StatsBar>, ms: number): Promise<void> {
    vi.advanceTimersByTime(ms);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function scrollIn(fixture: ComponentFixture<StatsBar>): Promise<void> {
    for (const observer of FakeIntersectionObserver.all) {
      if (observer.options.rootMargin !== '0px') {
        observer.sighting([
          { isIntersecting: true, boundingClientRect: rectAt(VIEWPORT_HEIGHT * 0.85) },
        ]);
      }
    }
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function finishEntrance(fixture: ComponentFixture<StatsBar>): Promise<void> {
    for (const stat of stats(fixture)) {
      stat.dispatchEvent(transitionEnd('translate'));
    }
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('when it is shown before the anniversary of 28 October 2005, then it counts the full years only', async () => {
    expect(read(await renderOn('2026-10-18T12:00:00Z'))[0]).toBe('20');
  });

  it('when it is shown on the anniversary, then the new year counts', async () => {
    expect(read(await renderOn('2026-10-28T12:00:00Z'))[0]).toBe('21');
  });

  it('when the browser cannot watch the viewport, then every figure stands at its value at once', async () => {
    const fixture = await renderOn('2026-10-30T12:00:00Z');

    expect(shown(fixture)).toEqual(FINAL);
  });

  describe('when motion is allowed and the figures are on the screen from the start', () => {
    let fixture: ComponentFixture<StatsBar>;

    beforeEach(async () => {
      allowMotion();
      fixture = await renderOn('2026-10-30T12:00:00Z');
    });

    it('then nothing hides them and the count starts at once from 70 % of each value', () => {
      expect(hidden(fixture)).toEqual([false, false, false, false]);
      expect(shown(fixture)).toEqual(FROM_SEVENTY_PERCENT);
      expect(counts.map((count) => count.options)).toEqual([
        { duration: 800, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)', fill: 'forwards' },
        { duration: 800, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)', fill: 'forwards' },
      ]);
    });

    it('then they count up in the count duration and end at their values', async () => {
      await wait(fixture, 400);
      const [years, children] = shown(fixture).map((text) => Number.parseInt(text, 10));
      expect(years).toBeGreaterThan(15);
      expect(years).toBeLessThan(21);
      expect(children).toBeGreaterThan(140);
      expect(children).toBeLessThan(200);

      await wait(fixture, COUNT_AND_A_FRAME - 400);
      expect(shown(fixture)).toEqual(FINAL);
    });

    it('then the share of 100% never counts and stays written without a space', async () => {
      const seen = new Set<string>();
      for (let step = 0; step < 10; step++) {
        seen.add(shown(fixture)[2]);
        await wait(fixture, 100);
      }

      expect([...seen]).toEqual(['100%']);
    });

    it('then a screen reader hears the final figures all along', async () => {
      expect(read(fixture)).toEqual(FINAL);
      await wait(fixture, 400);
      expect(read(fixture)).toEqual(FINAL);
    });

    it('and the page is printed while they count, then every figure stands at its value', async () => {
      await wait(fixture, 100);

      window.dispatchEvent(new Event('beforeprint'));
      await wait(fixture, 100);

      expect(shown(fixture)).toEqual(FINAL);
      expect(counts.every((count) => count.cancelled)).toBe(true);
    });

    it('and the page is left while they count, then the count stops', () => {
      fixture.destroy();

      expect(counts.every((count) => count.cancelled)).toBe(true);
    });

    it('and they counted up once, when they are shown again in the same visit, then they stand at their values at once', async () => {
      await wait(fixture, COUNT_AND_A_FRAME);
      fixture.destroy();

      const again = TestBed.createComponent(StatsBar);
      again.detectChanges();
      await again.whenStable();

      expect(shown(again)).toEqual(FINAL);
      expect(counts).toHaveLength(2);
    });
  });

  describe('when motion is allowed and the figures start below the screen', () => {
    let fixture: ComponentFixture<StatsBar>;

    beforeEach(async () => {
      allowMotion();
      fixture = await renderOn('2026-10-30T12:00:00Z', { top: BELOW_THE_SCREEN });
    });

    it('then they wait hidden, row by row, and nothing counts', async () => {
      await wait(fixture, 2000);

      expect(hidden(fixture)).toEqual([true, true, true, true]);
      expect(stats(fixture).map((stat) => stat.style.getPropertyValue('--reveal-order'))).toEqual([
        '0',
        '0',
        '1',
        '1',
      ]);
      expect(shown(fixture)).toEqual(FROM_SEVENTY_PERCENT);
      expect(counts).toEqual([]);
    });

    it('and the page is printed, then every figure shows at its value', async () => {
      window.dispatchEvent(new Event('beforeprint'));
      await wait(fixture, 100);

      expect(hidden(fixture)).toEqual([false, false, false, false]);
      expect(shown(fixture)).toEqual(FINAL);
    });

    it('then a screen reader hears the final figures while they wait', () => {
      expect(read(fixture)).toEqual(FINAL);
    });

    it('and they scroll in, then nothing counts while they are still moving in', async () => {
      await scrollIn(fixture);
      await wait(fixture, 300);

      expect(shown(fixture)).toEqual(FROM_SEVENTY_PERCENT);
      expect(counts).toEqual([]);
    });

    it('and they have moved in, then they count up to their values', async () => {
      await scrollIn(fixture);
      await finishEntrance(fixture);
      await wait(fixture, COUNT_AND_A_FRAME);

      expect(counts).toHaveLength(2);
      expect(shown(fixture)).toEqual(FINAL);
    });

    it('and the page is left before they came into view, then they still count up the next time', async () => {
      fixture.destroy();

      const again = TestBed.createComponent(StatsBar);
      again.detectChanges();
      await again.whenStable();

      expect(shown(again)).toEqual(FROM_SEVENTY_PERCENT);
    });
  });

  describe('when they enter together with what surrounds it, so they have no entrance of their own', () => {
    let fixture: ComponentFixture<StatsBar>;

    beforeEach(async () => {
      allowMotion();
      fixture = await renderOn('2026-10-30T12:00:00Z', { ownEntrance: false });
    });

    it('then every figure stands at its value at once without watching the viewport', () => {
      expect(shown(fixture)).toEqual(FINAL);
      expect(stats(fixture).some((stat) => stat.classList.contains('motion-reveal'))).toBe(false);
      expect(FakeIntersectionObserver.all).toEqual([]);
      expect(counts).toEqual([]);
    });

    it('and figures with their own entrance are shown later in the same visit, then those still count up', async () => {
      const later = TestBed.createComponent(StatsBar);
      later.detectChanges();
      await later.whenStable();

      expect(shown(later)).toEqual(FROM_SEVENTY_PERCENT);
    });
  });

  describe('when the visitor asks for reduced motion', () => {
    it('then every figure stands at its value at once and nothing counts', async () => {
      allowMotion({ reduced: true });
      const fixture = await renderOn('2026-10-30T12:00:00Z', { top: BELOW_THE_SCREEN });

      expect(shown(fixture)).toEqual(FINAL);
      expect(hidden(fixture)).toEqual([false, false, false, false]);
      expect(counts).toEqual([]);
    });
  });
});

function transitionEnd(propertyName: string): Event {
  const event = new Event('transitionend');
  Object.defineProperty(event, 'propertyName', { value: propertyName });
  return event;
}

function rectAt(top: number): DOMRect {
  return {
    top,
    bottom: top + 200,
    left: 0,
    right: 400,
    width: 400,
    height: 200,
    x: 0,
    y: top,
    toJSON: () => ({}),
  };
}
