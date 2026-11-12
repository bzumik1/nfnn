import { holdLandingStage, LANDING_STAGE_CLASS } from './landing-stage';

describe('Given the landing page, whose photo fills the screen and reaches under the status bar and the browser toolbar', () => {
  let hero: HTMLElement;
  let heroHeight: number;
  let scrolledTo: number[];
  let release: () => void;

  function scrollTo(top: number): void {
    Object.defineProperty(window, 'scrollY', { configurable: true, value: top });
    window.dispatchEvent(new Event('scroll'));
  }

  function nextFrame(): Promise<void> {
    return new Promise((done) => requestAnimationFrame(() => done()));
  }

  beforeEach(() => {
    document.documentElement.style.setProperty('--page-resting-scroll', '0px');
    const stage = document.createElement('style');
    stage.id = 'landing-stage-rule';
    stage.textContent = `.${LANDING_STAGE_CLASS} { --page-resting-scroll: 120px; }`;
    document.head.append(stage);
    document.documentElement.style.removeProperty('--page-resting-scroll');
    hero = document.createElement('section');
    heroHeight = window.innerHeight;
    hero.getBoundingClientRect = () => ({ height: heroHeight }) as DOMRect;
    document.body.append(hero);
    scrolledTo = [];
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    Object.defineProperty(window, 'scrollTo', {
      configurable: true,
      value: (options: ScrollToOptions) => {
        scrolledTo.push(options.top ?? 0);
        Object.defineProperty(window, 'scrollY', { configurable: true, value: options.top ?? 0 });
      },
    });
    release = holdLandingStage(document, hero);
  });

  afterEach(() => {
    release();
    hero.remove();
    document.getElementById('landing-stage-rule')?.remove();
    delete (window as { scrollY?: number }).scrollY;
    delete (window as { scrollTo?: unknown }).scrollTo;
  });

  it('when it opens, then the page takes the stage and rests scrolled past the photo above it', () => {
    expect(document.documentElement.classList).toContain(LANDING_STAGE_CLASS);
    expect(scrolledTo.at(-1)).toBe(120);
  });

  it('when something scrolls the page, then it returns to its resting place', async () => {
    scrollTo(400);
    await nextFrame();

    expect(window.scrollY).toBe(120);
  });

  it('when the text no longer fits one screen, then the page leaves the stage and scrolls from its top as any page', async () => {
    heroHeight = window.innerHeight + 200;
    window.dispatchEvent(new Event('resize'));
    await nextFrame();

    expect(document.documentElement.classList).not.toContain(LANDING_STAGE_CLASS);
    expect(window.scrollY).toBe(0);
  });

  it('when the visitor leaves the landing page, then the stage is taken down', () => {
    release();

    expect(document.documentElement.classList).not.toContain(LANDING_STAGE_CLASS);
  });
});
