import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Reveal } from './reveal';

type Sighting = (
  entries: Pick<IntersectionObserverEntry, 'isIntersecting' | 'boundingClientRect'>[],
) => void;

class FakeIntersectionObserver {
  static latest: FakeIntersectionObserver | undefined;
  observed: Element[] = [];
  disconnected = false;

  constructor(
    readonly sighting: Sighting,
    readonly options: IntersectionObserverInit,
  ) {
    FakeIntersectionObserver.latest = this;
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
  template: `<section [appReveal]="order()"><a href="#kontakt">Kontakt</a></section>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class RevealHost {
  readonly order = signal(0);
}

const VIEWPORT_HEIGHT = 800;

describe('Given a block of a public page that reveals itself', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete (navigator as { standalone?: boolean }).standalone;
    delete (navigator as { maxTouchPoints?: number }).maxTouchPoints;
    FakeIntersectionObserver.latest = undefined;
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

  async function sight(fixture: ComponentFixture<RevealHost>, top: number): Promise<void> {
    FakeIntersectionObserver.latest?.sighting([
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
      expect(FakeIntersectionObserver.latest?.observed).toEqual([block(fixture)]);
      expect(FakeIntersectionObserver.latest?.options).toEqual({
        rootMargin: '0px 0px -10% 0px',
        threshold: 0,
      });
    });

    it('then scrolling it in over the bottom edge moves it in once', async () => {
      allowMotion();
      const fixture = await renderWithTopAt(VIEWPORT_HEIGHT + 200);

      await sight(fixture, VIEWPORT_HEIGHT * 0.85);

      expect(movesIn(fixture)).toBe(true);
      expect(FakeIntersectionObserver.latest?.disconnected).toBe(true);
    });

    it('then a jump that lands it high on the screen shows it at once', async () => {
      allowMotion();
      const fixture = await renderWithTopAt(VIEWPORT_HEIGHT + 200);

      await sight(fixture, 120);

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

      expect(FakeIntersectionObserver.latest?.disconnected).toBe(true);
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
    expect(FakeIntersectionObserver.latest).toBeUndefined();
  });

  it('when the visitor asked for less motion, then nothing hides it', async () => {
    allowMotion({ reduced: true });

    const fixture = await renderWithTopAt(VIEWPORT_HEIGHT + 200);

    expect(standsStill(fixture)).toBe(true);
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
