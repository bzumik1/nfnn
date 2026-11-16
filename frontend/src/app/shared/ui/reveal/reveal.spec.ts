import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Reveal } from './reveal';

type Sighting = (
  entries: Pick<IntersectionObserverEntry, 'isIntersecting' | 'boundingClientRect'>[],
) => void;

class FakeIntersectionObserver {
  static all: FakeIntersectionObserver[] = [];
  observed: Element[] = [];
  disconnected = false;

  constructor(
    readonly sighting: Sighting,
    readonly options: IntersectionObserverInit,
  ) {
    FakeIntersectionObserver.all.push(this);
  }

  static watching(rootMargin: string): FakeIntersectionObserver | undefined {
    return FakeIntersectionObserver.all.find(
      (observer) => observer.options.rootMargin === rootMargin,
    );
  }

  observe(element: Element): void {
    this.observed.push(element);
  }

  disconnect(): void {
    this.disconnected = true;
  }
}

@Component({
  imports: [Reveal],
  template: `<section [appReveal]="order()" (revealed)="revealed.set(revealed() + 1)">
    <a href="#kontakt">Kontakt</a>
  </section>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class RevealHost {
  readonly order = signal(0);
  readonly revealed = signal(0);
}

const VIEWPORT_HEIGHT = 800;

describe('Given a block of a public page that reveals itself', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete (navigator as { standalone?: boolean }).standalone;
    delete (navigator as { maxTouchPoints?: number }).maxTouchPoints;
    document.documentElement.style.removeProperty('--duration-reveal');
    vi.useRealTimers();
    FakeIntersectionObserver.all = [];
  });

  function allowMotion({
    reduced = false,
    observer = true,
    homeScreenApp = false,
  }: { reduced?: boolean; observer?: boolean; homeScreenApp?: boolean } = {}): void {
    vi.stubGlobal('IntersectionObserver', observer ? FakeIntersectionObserver : undefined);
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: reduced && query === '(prefers-reduced-motion: reduce)',
    }));
    vi.stubGlobal('innerHeight', VIEWPORT_HEIGHT);
    Object.defineProperty(navigator, 'standalone', {
      configurable: true,
      get: () => homeScreenApp,
    });
    Object.defineProperty(navigator, 'maxTouchPoints', {
      configurable: true,
      get: () => (homeScreenApp ? 5 : 0),
    });
  }

  async function renderWithTopAt(top: number, order = 0): Promise<ComponentFixture<RevealHost>> {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(rectAt(top));
    await TestBed.configureTestingModule({ imports: [RevealHost] }).compileComponents();
    const fixture = TestBed.createComponent(RevealHost);
    fixture.componentInstance.order.set(order);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  function block(fixture: ComponentFixture<RevealHost>): HTMLElement {
    return (fixture.nativeElement as HTMLElement).querySelector('section')!;
  }

  function waits(fixture: ComponentFixture<RevealHost>): boolean {
    const classes = block(fixture).classList;
    return classes.contains('motion-reveal') && !classes.contains('motion-reveal--shown');
  }

  function movesIn(fixture: ComponentFixture<RevealHost>): boolean {
    const classes = block(fixture).classList;
    return classes.contains('motion-reveal') && classes.contains('motion-reveal--shown');
  }

  function standsStill(fixture: ComponentFixture<RevealHost>): boolean {
    return !block(fixture).classList.contains('motion-reveal');
  }

  const LINE = '0px 0px -10% 0px';
  const SCREEN = '0px';

  async function sight(
    fixture: ComponentFixture<RevealHost>,
    top: number,
    rootMargin = LINE,
  ): Promise<void> {
    FakeIntersectionObserver.watching(rootMargin)?.sighting([
      { isIntersecting: true, boundingClientRect: rectAt(top) },
    ]);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  describe('when it starts below the screen', () => {
    it('then it waits hidden, watched from a tenth above the bottom edge', async () => {
      allowMotion();

      const fixture = await renderWithTopAt(VIEWPORT_HEIGHT + 200);

      expect(waits(fixture)).toBe(true);
      expect(FakeIntersectionObserver.watching(LINE)?.observed).toEqual([block(fixture)]);
      expect(FakeIntersectionObserver.watching(LINE)?.options.threshold).toBe(0);
    });

    it('then scrolling it in over the bottom edge moves it in once', async () => {
      allowMotion();
      const fixture = await renderWithTopAt(VIEWPORT_HEIGHT + 200);

      await sight(fixture, VIEWPORT_HEIGHT * 0.85);

      expect(movesIn(fixture)).toBe(true);
      expect(FakeIntersectionObserver.all.every((observer) => observer.disconnected)).toBe(true);
    });

    it('then once it has moved in, it stands still and leaves its transitions to the page', async () => {
      allowMotion();
      const fixture = await renderWithTopAt(VIEWPORT_HEIGHT + 200);
      await sight(fixture, VIEWPORT_HEIGHT * 0.85);

      block(fixture).dispatchEvent(transitionEnd('opacity'));
      fixture.detectChanges();
      expect(movesIn(fixture)).toBe(true);

      block(fixture).dispatchEvent(transitionEnd('translate'));
      fixture.detectChanges();
      expect(standsStill(fixture)).toBe(true);
    });

    it('then it tells the page it is shown only once it has moved in, and only once', async () => {
      allowMotion();
      const fixture = await renderWithTopAt(VIEWPORT_HEIGHT + 200);
      expect(fixture.componentInstance.revealed()).toBe(0);

      await sight(fixture, VIEWPORT_HEIGHT * 0.85);
      block(fixture).dispatchEvent(transitionEnd('opacity'));
      expect(fixture.componentInstance.revealed()).toBe(0);

      block(fixture).dispatchEvent(transitionEnd('translate'));
      block(fixture).dispatchEvent(transitionEnd('translate'));
      expect(fixture.componentInstance.revealed()).toBe(1);
    });

    it('then a jump that shows it at once tells the page it is shown', async () => {
      allowMotion();
      const fixture = await renderWithTopAt(VIEWPORT_HEIGHT + 200);

      await sight(fixture, VIEWPORT_HEIGHT * 0.65);

      expect(fixture.componentInstance.revealed()).toBe(1);
    });

    it('then a jump that lands it in the upper two thirds of the screen shows it at once', async () => {
      allowMotion();
      const fixture = await renderWithTopAt(VIEWPORT_HEIGHT + 200);

      await sight(fixture, VIEWPORT_HEIGHT * 0.65);

      expect(standsStill(fixture)).toBe(true);
    });

    it('then stopping in the last tenth of the screen, where the page ends, moves it in after the reveal time', async () => {
      vi.useFakeTimers();
      allowMotion();
      document.documentElement.style.setProperty('--duration-reveal', '0.5s');
      const fixture = await renderWithTopAt(VIEWPORT_HEIGHT + 200);

      await sight(fixture, VIEWPORT_HEIGHT * 0.95, SCREEN);
      vi.advanceTimersByTime(499);
      fixture.detectChanges();
      expect(waits(fixture)).toBe(true);

      vi.advanceTimersByTime(1);
      fixture.detectChanges();
      expect(movesIn(fixture)).toBe(true);
      expect(FakeIntersectionObserver.all.every((observer) => observer.disconnected)).toBe(true);
    });

    it('then passing the last tenth on its way up waits for the line, not for the time', async () => {
      vi.useFakeTimers();
      allowMotion();
      document.documentElement.style.setProperty('--duration-reveal', '0.5s');
      const fixture = await renderWithTopAt(VIEWPORT_HEIGHT + 200);

      await sight(fixture, VIEWPORT_HEIGHT * 0.95, SCREEN);
      await sight(fixture, VIEWPORT_HEIGHT * 0.88);
      vi.advanceTimersByTime(500);
      block(fixture).dispatchEvent(transitionEnd('translate'));
      fixture.detectChanges();

      expect(standsStill(fixture)).toBe(true);
    });

    it('then focus entering it shows it at once', async () => {
      allowMotion();
      const fixture = await renderWithTopAt(VIEWPORT_HEIGHT + 200);

      block(fixture)
        .querySelector('a')!
        .dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      fixture.detectChanges();
      await fixture.whenStable();

      expect(standsStill(fixture)).toBe(true);
    });

    it('then printing the page shows it at once', async () => {
      allowMotion();
      const fixture = await renderWithTopAt(VIEWPORT_HEIGHT + 200);

      window.dispatchEvent(new Event('beforeprint'));
      fixture.detectChanges();
      await fixture.whenStable();

      expect(standsStill(fixture)).toBe(true);
    });

    it('then leaving the page stops watching it', async () => {
      allowMotion();
      const fixture = await renderWithTopAt(VIEWPORT_HEIGHT + 200);

      fixture.destroy();

      expect(FakeIntersectionObserver.all.every((observer) => observer.disconnected)).toBe(true);
    });

    it('then its place in a row delays it by that many steps, at most six', async () => {
      allowMotion();
      const fixture = await renderWithTopAt(VIEWPORT_HEIGHT + 200, 9);

      expect(block(fixture).style.getPropertyValue('--reveal-order')).toBe('6');
    });
  });

  it('when it is on the screen from the start, then nothing hides it', async () => {
    allowMotion();

    const fixture = await renderWithTopAt(300);

    expect(standsStill(fixture)).toBe(true);
    expect(FakeIntersectionObserver.all).toEqual([]);
    expect(fixture.componentInstance.revealed()).toBe(1);
  });

  it('when the visitor asked for less motion, then nothing hides it', async () => {
    allowMotion({ reduced: true });

    const fixture = await renderWithTopAt(VIEWPORT_HEIGHT + 200);

    expect(standsStill(fixture)).toBe(true);
    expect(fixture.componentInstance.revealed()).toBe(1);
  });

  it('when the browser cannot watch the screen, then nothing hides it', async () => {
    allowMotion({ observer: false });

    const fixture = await renderWithTopAt(VIEWPORT_HEIGHT + 200);

    expect(standsStill(fixture)).toBe(true);
  });

  it('when it runs in the app on the home screen of an iPhone or iPad, then nothing hides it', async () => {
    allowMotion({ homeScreenApp: true });

    const fixture = await renderWithTopAt(VIEWPORT_HEIGHT + 200);

    expect(standsStill(fixture)).toBe(true);
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
