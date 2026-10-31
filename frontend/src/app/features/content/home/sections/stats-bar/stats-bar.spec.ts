import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StatsBar } from './stats-bar';

type Sighting = (entries: Pick<IntersectionObserverEntry, 'isIntersecting'>[]) => void;

class FakeIntersectionObserver {
  static latest: FakeIntersectionObserver | undefined;
  observed: Element[] = [];
  disconnected = false;

  constructor(readonly sighting: Sighting) {
    FakeIntersectionObserver.latest = this;
  }

  observe(element: Element): void {
    this.observed.push(element);
  }

  disconnect(): void {
    this.disconnected = true;
  }
}

describe('Given the stats bar', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    FakeIntersectionObserver.latest = undefined;
  });

  async function renderOn(day: string): Promise<ComponentFixture<StatsBar>> {
    vi.useFakeTimers({ toFake: ['Date', 'requestAnimationFrame', 'performance'] });
    vi.setSystemTime(new Date(day));
    await TestBed.configureTestingModule({ imports: [StatsBar] }).compileComponents();
    const fixture = TestBed.createComponent(StatsBar);
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

  function allowMotion(reduced: boolean): void {
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: reduced && query === '(prefers-reduced-motion: reduce)',
    }));
  }

  async function scrollIntoView(fixture: ComponentFixture<StatsBar>): Promise<void> {
    FakeIntersectionObserver.latest?.sighting([{ isIntersecting: true }]);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function wait(fixture: ComponentFixture<StatsBar>, ms: number): Promise<void> {
    vi.advanceTimersByTime(ms);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('when it is shown before the anniversary of 28 October 2005, then it counts the full years only', async () => {
    expect(shown(await renderOn('2026-10-18T12:00:00Z'))[0]).toBe('20');
  });

  it('when it is shown on the anniversary, then the new year counts', async () => {
    expect(shown(await renderOn('2026-10-28T12:00:00Z'))[0]).toBe('21');
  });

  it('when the browser cannot watch the viewport, then every figure stands at its value at once', async () => {
    const fixture = await renderOn('2026-10-30T12:00:00Z');

    expect(shown(fixture)).toEqual(['21', '200+', '100%', '2005']);
    expect(stats(fixture).every((stat) => !stat.classList.contains('is-waiting'))).toBe(true);
  });

  describe('when motion is allowed', () => {
    let fixture: ComponentFixture<StatsBar>;

    beforeEach(async () => {
      allowMotion(false);
      fixture = await renderOn('2026-10-30T12:00:00Z');
    });

    it('then the figures wait at zero, hidden, until the bar scrolls into view', () => {
      expect(shown(fixture)).toEqual(['0', '0+', '0%', '2005']);
      expect(stats(fixture).every((stat) => stat.classList.contains('is-waiting'))).toBe(true);
      expect(FakeIntersectionObserver.latest?.observed).toEqual([fixture.nativeElement]);
    });

    it('then a screen reader hears the final figures all along', () => {
      expect(read(fixture)).toEqual(['21', '200+', '100%', '2005']);
    });

    it('and the bar scrolls into view, then the figures appear and count up to their values', async () => {
      await scrollIntoView(fixture);

      expect(stats(fixture).every((stat) => !stat.classList.contains('is-waiting'))).toBe(true);
      expect(FakeIntersectionObserver.latest?.disconnected).toBe(true);

      await wait(fixture, 600);
      const [years, children, transparency, founded] = shown(fixture).map((text) =>
        Number.parseInt(text, 10),
      );
      expect(years).toBeGreaterThan(0);
      expect(years).toBeLessThan(21);
      expect(children).toBeGreaterThan(0);
      expect(children).toBeLessThan(200);
      expect(transparency).toBeGreaterThan(0);
      expect(transparency).toBeLessThan(100);
      expect(founded).toBe(2005);

      await wait(fixture, 2000);
      expect(shown(fixture)).toEqual(['21', '200+', '100%', '2005']);
    });

    it('and the bar is not in view yet, then nothing starts', async () => {
      FakeIntersectionObserver.latest?.sighting([{ isIntersecting: false }]);
      await wait(fixture, 2000);

      expect(shown(fixture)).toEqual(['0', '0+', '0%', '2005']);
      expect(FakeIntersectionObserver.latest?.disconnected).toBe(false);
    });

    it('and the page is left, then the watch on the viewport stops', () => {
      fixture.destroy();

      expect(FakeIntersectionObserver.latest?.disconnected).toBe(true);
    });
  });

  describe('when the visitor asks for reduced motion', () => {
    it('then every figure stands at its value at once without watching the viewport', async () => {
      allowMotion(true);
      const fixture = await renderOn('2026-10-30T12:00:00Z');

      expect(shown(fixture)).toEqual(['21', '200+', '100%', '2005']);
      expect(stats(fixture).every((stat) => !stat.classList.contains('is-waiting'))).toBe(true);
      expect(FakeIntersectionObserver.latest).toBeUndefined();
    });
  });
});
