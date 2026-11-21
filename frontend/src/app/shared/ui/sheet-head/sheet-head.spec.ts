import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CompactLayout } from '../../../core/layout/compact-layout';
import { PageTransitions } from '../../../core/navigation/page-transitions';
import { SheetHead } from './sheet-head';
import { withOrdinarySpaces } from '../../../../testing/ordinary-spaces';

describe('Given the head of a page inside a sheet', () => {
  let fixture: ComponentFixture<SheetHead>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SheetHead] }).compileComponents();
    fixture = TestBed.createComponent(SheetHead);
    fixture.componentRef.setInput('title', 'Můj přehled');
  });

  const head = () => fixture.nativeElement as HTMLElement;
  const button = (name: string) =>
    head().querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
  const buttons = () =>
    [...head().querySelectorAll('button')].map((each) => each.getAttribute('aria-label'));

  describe('when the sheet names its page by the head', () => {
    beforeEach(() => {
      fixture.componentRef.setInput('titleId', 'account-section-title');
      fixture.detectChanges();
    });

    it('then Zpět leads, the title is the heading in the middle and Zavřít ends the row', () => {
      expect(buttons()).toEqual(['Zpět', 'Zavřít']);
      const title = head().querySelector('h2');
      expect(title?.id).toBe('account-section-title');
      expect(withOrdinarySpaces(title?.textContent)?.trim()).toBe('Můj přehled');
      expect(title?.getAttribute('tabindex')).toBe('-1');
      expect(button('Zpět')?.compareDocumentPosition(title!)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
      expect(title?.compareDocumentPosition(button('Zavřít')!)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });
  });

  describe('when the page under it carries its own heading', () => {
    beforeEach(() => fixture.detectChanges());

    it('then the head shows the title without reading it out a second time', () => {
      expect(head().querySelector('h1, h2, h3')).toBeNull();
      const title = head().querySelector('p[aria-hidden="true"]');
      expect(withOrdinarySpaces(title?.textContent)?.trim()).toBe('Můj přehled');
      expect(buttons()).toEqual(['Zpět', 'Zavřít']);
    });
  });

  it('when Zpět is pressed, then the sheet is asked to step back', () => {
    fixture.detectChanges();
    const steps: string[] = [];
    fixture.componentInstance.backPressed.subscribe(() => steps.push('back'));
    fixture.componentInstance.closePressed.subscribe(() => steps.push('close'));

    button('Zpět')!.click();

    expect(steps).toEqual(['back']);
  });

  it('when Zavřít is pressed, then the sheet is asked to close', () => {
    fixture.detectChanges();
    const steps: string[] = [];
    fixture.componentInstance.backPressed.subscribe(() => steps.push('back'));
    fixture.componentInstance.closePressed.subscribe(() => steps.push('close'));

    button('Zavřít')!.click();

    expect(steps).toEqual(['close']);
  });
});

describe('Given the head of a page inside a sheet whose title arrives only after the page', () => {
  interface Fade {
    readonly keyframes: Keyframe[];
    readonly duration: number;
    readonly text: string;
    end(): Promise<void>;
    cancelled: boolean;
  }

  let fixture: ComponentFixture<SheetHead>;
  let fades: Fade[];
  let stepping: ReturnType<typeof signal<boolean>>;
  let compact: ReturnType<typeof signal<boolean>>;
  let lessMotion: boolean;

  beforeEach(async () => {
    fades = [];
    lessMotion = false;
    stepping = signal(false);
    compact = signal(true);
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) =>
        ({
          matches: query.includes('prefers-reduced-motion') && lessMotion,
          media: query,
        }) as MediaQueryList,
    });
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value(this: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
        let done = (): void => undefined;
        const finished = new Promise<void>((resolve) => (done = resolve));
        const fade: Fade = {
          keyframes,
          duration: Number(options.duration),
          text: (this.textContent ?? '').trim(),
          cancelled: false,
          end: async () => {
            done();
            await finished;
            await fixture.whenStable();
          },
        };
        fades.push(fade);
        return {
          finished,
          cancel: () => (fade.cancelled = true),
        } as unknown as Animation;
      },
    });
    document.documentElement.style.setProperty('--duration-fast', '150ms');
    await TestBed.configureTestingModule({
      imports: [SheetHead],
      providers: [
        { provide: PageTransitions, useValue: { stepping: stepping.asReadonly() } },
        { provide: CompactLayout, useValue: { isCompact: compact.asReadonly() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(SheetHead);
    fixture.componentRef.setInput('title', 'Dárce');
    fixture.detectChanges();
  });

  afterEach(() => {
    delete (HTMLElement.prototype as { animate?: unknown }).animate;
    delete (window as { matchMedia?: unknown }).matchMedia;
    document.documentElement.style.removeProperty('--duration-fast');
  });

  function shown(): string {
    const title = (fixture.nativeElement as HTMLElement).querySelector('.sheet-head-title');
    return (withOrdinarySpaces(title?.textContent) ?? '').trim();
  }

  async function arrives(title: string): Promise<void> {
    fixture.componentRef.setInput('lateTitle', title);
    await fixture.whenStable();
  }

  it('when the title arrives with no step moving, then the old title fades out whole before the new one fades in, by opacity alone, within the short duration', async () => {
    await arrives('Petr Svoboda');

    expect(fades.map((fade) => [fade.keyframes, fade.duration, fade.text])).toEqual([
      [[{ opacity: 1 }, { opacity: 0 }], 75, 'Dárce'],
    ]);
    expect(shown()).toBe('Dárce');

    await fades[0].end();

    expect(shown()).toBe('Petr Svoboda');
    expect(fades.map((fade) => [fade.keyframes, fade.duration, fade.text])).toEqual([
      [[{ opacity: 1 }, { opacity: 0 }], 75, 'Dárce'],
      [[{ opacity: 0 }, { opacity: 1 }], 75, 'Petr Svoboda'],
    ]);
  });

  it('when the title arrives while the step to the page still moves, then the head keeps the title the step carries and fades only once the step has ended', async () => {
    stepping.set(true);

    await arrives('Petr Svoboda');
    expect(fades).toEqual([]);
    expect(shown()).toBe('Dárce');

    stepping.set(false);
    await fixture.whenStable();

    expect(fades.map((fade) => fade.text)).toEqual(['Dárce']);
  });

  it('when the system asks for less motion, then the title that arrives shows at once', async () => {
    lessMotion = true;

    await arrives('Petr Svoboda');

    expect(fades).toEqual([]);
    expect(shown()).toBe('Petr Svoboda');
  });

  it('when the window grows past the side navigation during the fade, then the fade ends at once on the title that arrived', async () => {
    await arrives('Petr Svoboda');

    compact.set(false);
    await fixture.whenStable();

    expect(fades[0].cancelled).toBe(true);
    expect(shown()).toBe('Petr Svoboda');
  });

  it('when another page gives the head its own title during the fade, then that title shows at once and the fade is let go', async () => {
    await arrives('Petr Svoboda');

    fixture.componentRef.setInput('lateTitle', null);
    fixture.componentRef.setInput('title', 'Platby z banky');
    await fixture.whenStable();
    await fades[0].end();

    expect(fades[0].cancelled).toBe(true);
    expect(fades).toHaveLength(1);
    expect(shown()).toBe('Platby z banky');
  });

  it('when the title of the page is given with the page, then it shows at once, never faded', async () => {
    fixture.componentRef.setInput('title', 'Platby z banky');
    await fixture.whenStable();

    expect(fades).toEqual([]);
    expect(shown()).toBe('Platby z banky');
  });
});
