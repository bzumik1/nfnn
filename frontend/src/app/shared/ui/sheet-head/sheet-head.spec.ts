import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CompactLayout } from '../../../core/layout/compact-layout';
import { PageTransitions } from '../../../core/navigation/page-transitions';
import { SHEET_HEAD_RESIZE_OBSERVER, SheetHead } from './sheet-head';
import { withOrdinarySpaces } from '../../../../testing/ordinary-spaces';
import { InputModality } from '../../../core/input/input-modality';

@Component({
  imports: [SheetHead],
  template: `<div class="dialog-panel">
    @if (shown()) {
      <app-sheet-head title="Údaje a zabezpečení" />
    }
    <input id="below" aria-label="E-mail" />
    <button id="toggle" type="button">Změnit heslo</button>
    <button id="cancel" type="button">Zrušit</button>
    <dialog id="opened-inside" tabindex="-1" open>
      <div class="dialog-panel"><input id="nested" aria-label="Číslo účtu" /></div>
    </dialog>
  </div>`,
})
class SheetPanel {
  readonly shown = signal(true);
}

function stillSteps() {
  return [
    { provide: PageTransitions, useValue: { stepping: signal(false).asReadonly() } },
    { provide: CompactLayout, useValue: { isCompact: signal(true).asReadonly() } },
  ];
}

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

describe('Given the head of a page standing in the scrolling panel of a sheet', () => {
  let fixture: ComponentFixture<SheetPanel>;
  let watchers: WatchedSizes[];

  class WatchedSizes {
    readonly targets = new Set<Element>();

    constructor(readonly callback: ResizeObserverCallback) {}

    observe(target: Element): void {
      this.targets.add(target);
      if (!watchers.includes(this)) {
        watchers.push(this);
      }
    }

    disconnect(): void {
      watchers = watchers.filter((watcher) => watcher !== this);
    }
  }

  const deliver = (entry: Partial<ResizeObserverEntry>) =>
    watchers
      .filter((watcher) => entry.target !== undefined && watcher.targets.has(entry.target))
      .forEach((watcher) =>
        watcher.callback([entry as ResizeObserverEntry], watcher as unknown as ResizeObserver),
      );

  beforeEach(async () => {
    watchers = [];
    await TestBed.configureTestingModule({
      imports: [SheetPanel],
      providers: [
        ...stillSteps(),
        {
          provide: SHEET_HEAD_RESIZE_OBSERVER,
          useValue: WatchedSizes as unknown as typeof ResizeObserver,
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(SheetPanel);
    await fixture.whenStable();
  });

  const panel = () =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.dialog-panel')!;
  const head = () =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('app-sheet-head');

  const resizeTo = (blockSize: number) =>
    deliver({
      target: head() ?? undefined,
      borderBoxSize: [{ blockSize, inlineSize: 390 }],
    });

  it('when its border box is measured 63.2 px tall, then the panel knows its height rounded up, so a control scrolled into view stops below it', () => {
    resizeTo(63.2);

    expect(panel().style.getPropertyValue('--sheet-head-height')).toBe('64px');
  });

  it('when its offset height reads 58 px while its border box is 64 px tall, then the panel takes the border box', () => {
    Object.defineProperty(head()!, 'offsetHeight', { value: 58, configurable: true });

    resizeTo(64);

    expect(panel().style.getPropertyValue('--sheet-head-height')).toBe('64px');
  });

  const standAt = (element: HTMLElement, top: number, height: number) =>
    Object.defineProperty(element, 'getBoundingClientRect', {
      value: () => ({ top, bottom: top + height, height }) as DOMRect,
      configurable: true,
    });

  it('when it stands 19 px below the top of the panel, then the panel knows where its bottom ends, so a control scrolled into view stops below it', () => {
    standAt(panel(), 100, 600);
    standAt(head()!, 119, 57);

    resizeTo(57);

    expect(panel().style.getPropertyValue('--sheet-head-height')).toBe('76px');
  });

  it('when it stands at the top of the panel, then the panel knows its own height', () => {
    standAt(panel(), 100, 600);
    standAt(head()!, 100, 57);

    resizeTo(57);

    expect(panel().style.getPropertyValue('--sheet-head-height')).toBe('57px');
  });

  it('when the panel is still growing in from a smaller scale, then the offset is read at the full size of the panel', () => {
    Object.defineProperty(panel(), 'offsetHeight', { value: 600, configurable: true });
    standAt(panel(), 100, 450);
    standAt(head()!, 114.25, 42.75);

    resizeTo(57);

    expect(panel().style.getPropertyValue('--sheet-head-height')).toBe('76px');
  });

  it('when the panel moves while the head keeps its size, then the panel takes the new bottom of the head', () => {
    standAt(panel(), 100, 600);
    standAt(head()!, 100, 57);
    resizeTo(57);
    standAt(head()!, 119, 57);

    deliver({ target: panel(), borderBoxSize: [] });

    expect(panel().style.getPropertyValue('--sheet-head-height')).toBe('76px');
  });

  it("when the head keeps its size and only the panel changes, then the panel takes the head's new offset", () => {
    standAt(panel(), 100, 600);
    standAt(head()!, 119, 57);
    resizeTo(57);
    standAt(panel(), 81, 640);

    deliver({ target: panel(), borderBoxSize: [{ blockSize: 640, inlineSize: 390 }] });

    expect(panel().style.getPropertyValue('--sheet-head-height')).toBe('95px');
  });

  it('when an entry carries no box sizes, then the head keeps the height it had', () => {
    standAt(panel(), 100, 600);
    standAt(head()!, 100, 57);
    resizeTo(57);

    deliver({ target: head()! });

    expect(panel().style.getPropertyValue('--sheet-head-height')).toBe('57px');
  });

  describe('when the focus comes into the sheet', () => {
    const control = (selector: string) =>
      (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(selector)!;
    const padding = () => panel().style.getPropertyValue('scroll-padding-top');
    const nextFrame = () => new Promise<void>((done) => requestAnimationFrame(() => done()));
    let scrolled: number[];

    beforeEach(() => {
      scrolled = [];
      panel().scrollBy = ((options: ScrollToOptions) => scrolled.push(options.top ?? 0)) as never;
      standAt(panel(), 100, 600);
      standAt(head()!, 100, 57);
    });

    it('when Zpět takes it, then the panel drops its scroll padding, so the browser never scrolls to bring a control of the sticky head below the head', () => {
      control('button[aria-label="Zpět"]').focus();

      expect(padding()).toBe('0px');
    });

    it('when it moves from Zpět to Zavřít, then the panel still keeps no scroll padding', () => {
      control('button[aria-label="Zpět"]').focus();

      control('button[aria-label="Zavřít"]').focus();

      expect(padding()).toBe('0px');
    });

    it("when it leaves Zavřít for a field below, then the panel takes the head's height as its scroll padding again before the field is focused", () => {
      let paddingWhenFieldFocused: string | null = null;
      control('#below').addEventListener('focusin', () => (paddingWhenFieldFocused = padding()));
      control('button[aria-label="Zavřít"]').focus();

      control('#below').focus();

      expect(paddingWhenFieldFocused).toBe('');
      expect(padding()).toBe('');
    });

    it('when the browser leaves a field it focused 27 px under the head, then the panel scrolls the field down below the head in the next frame', async () => {
      standAt(control('#below'), 130, 40);

      control('#below').focus();
      await nextFrame();

      expect(scrolled).toEqual([-27]);
    });

    describe('when a finger pressed last', () => {
      const pressByFinger = (element: HTMLElement) =>
        element.dispatchEvent(new Event('pointerdown', { bubbles: true }));

      beforeEach(() => {
        const modality = TestBed.inject(InputModality);
        modality.start();
        onTestFinished(() => modality.stop());
      });

      it('when the press focuses a button half under the head, then the panel stays where it is, so nothing moves under the finger', async () => {
        const toggle = control('#toggle');
        standAt(toggle, 130, 40);

        pressByFinger(toggle);
        toggle.focus();
        await nextFrame();

        expect(scrolled).toEqual([]);
      });

      it('when code returns the focus to the pressed button partly below the head, then the panel drops its scroll padding before the browser scrolls, so the button stays under the finger', () => {
        const toggle = control('#toggle');
        standAt(toggle, 130, 40);
        pressByFinger(toggle);

        toggle.focus();

        expect(padding()).toBe('0px');
      });

      it('when two frames have passed since, then the panel takes its scroll padding again', async () => {
        const toggle = control('#toggle');
        standAt(toggle, 130, 40);
        pressByFinger(toggle);

        toggle.focus();
        await nextFrame();
        await nextFrame();

        expect(padding()).toBe('');
      });

      it('when code moves the focus from the pressed button to another one half under the head, then the panel brings that one below the head in the next frame', async () => {
        pressByFinger(control('#cancel'));
        standAt(control('#toggle'), 130, 40);

        control('#toggle').focus();
        await nextFrame();

        expect(padding()).toBe('');
        expect(scrolled).toEqual([-27]);
      });

      it('when the pressed control is hidden entirely under the head, then the panel keeps its scroll padding, so the browser brings it below the head', () => {
        const toggle = control('#toggle');
        standAt(toggle, 100, 40);
        pressByFinger(toggle);

        toggle.focus();

        expect(padding()).toBe('');
      });

      it('when the press focuses a field half under the head and no software keyboard moves it, then the panel keeps its scroll padding for keyboard avoidance and brings the field below the head in the next frame', async () => {
        const field = control('#below');
        standAt(field, 130, 40);

        pressByFinger(field);
        field.focus();
        expect(padding()).toBe('');
        await nextFrame();

        expect(scrolled).toEqual([-27]);
      });
    });

    it('when a focused field already stands below the head, then the panel stays where it is', async () => {
      standAt(control('#below'), 170, 40);

      control('#below').focus();
      await nextFrame();

      expect(scrolled).toEqual([]);
    });

    it('when a field of a dialog opened inside the sheet takes it, then the panel of the sheet leaves it alone', async () => {
      standAt(control('#nested'), 0, 40);

      control('#nested').focus();
      await nextFrame();

      expect(scrolled).toEqual([]);
      expect(padding()).toBe('');
    });

    it('when a dialog opened inside the sheet takes it itself as it closes, then the panel of the sheet leaves it alone', async () => {
      standAt(control('#opened-inside'), 0, 800);

      control('#opened-inside').focus();
      await nextFrame();

      expect(scrolled).toEqual([]);
      expect(padding()).toBe('');
    });

    it('when the head leaves while Zpět has it, then the panel keeps no scroll padding of its own', async () => {
      control('button[aria-label="Zpět"]').focus();

      fixture.componentInstance.shown.set(false);
      await fixture.whenStable();

      expect(padding()).toBe('');
    });
  });

  it('when it leaves, then the panel forgets its height', async () => {
    fixture.componentInstance.shown.set(false);
    await fixture.whenStable();

    expect(head()).toBeNull();
    expect(panel().style.getPropertyValue('--sheet-head-height')).toBe('');
  });

  it('when it leaves and the panel is resized afterwards, then nothing watches it any more and the panel keeps no height', async () => {
    fixture.componentInstance.shown.set(false);
    await fixture.whenStable();

    resizeTo(64);

    expect(watchers).toEqual([]);
    expect(panel().style.getPropertyValue('--sheet-head-height')).toBe('');
  });
});

describe('Given the head of a page that stands in no sheet panel', () => {
  it('when it is shown, then no element around it takes its height', async () => {
    await TestBed.configureTestingModule({
      imports: [SheetHead],
      providers: stillSteps(),
    }).compileComponents();
    const fixture = TestBed.createComponent(SheetHead);
    fixture.componentRef.setInput('title', 'Dárci');
    await fixture.whenStable();

    const around = (fixture.nativeElement as HTMLElement).parentElement!;
    expect(around.style.getPropertyValue('--sheet-head-height')).toBe('');
    expect(document.documentElement.style.getPropertyValue('--sheet-head-height')).toBe('');
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

  async function aFrameLater(): Promise<void> {
    await new Promise((done) => requestAnimationFrame(done));
    await fixture.whenStable();
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

  it('when the next donor’s card opens under the same title of the head and its name has not arrived yet, then the head shows that title again, never the last donor’s name', async () => {
    await arrives('Petr Svoboda');
    await fades[0].end();
    expect(shown()).toBe('Petr Svoboda');

    fixture.componentRef.setInput('lateTitle', null);
    await fixture.whenStable();
    await aFrameLater();

    expect(shown()).toBe('Dárce');
  });

  it('when the page lets the late title go and gives the same name again a render later with no step moving, as Správa does when a step back returns to a donor’s card, then the head keeps the name and never shows its own title', async () => {
    await arrives('Petr Svoboda');
    await fades[0].end();

    fixture.componentRef.setInput('lateTitle', null);
    await fixture.whenStable();
    expect(shown()).toBe('Petr Svoboda');
    await arrives('Petr Svoboda');
    await aFrameLater();

    expect(shown()).toBe('Petr Svoboda');
    expect(fades).toHaveLength(2);
  });

  it('when a step back to a page under the same title lets the late title go and the page gives the same name again while the step moves, as a donor’s card does after one of its sections, then the head keeps the name throughout and never fades', async () => {
    await arrives('Petr Svoboda');
    await fades[0].end();
    stepping.set(true);

    fixture.componentRef.setInput('lateTitle', null);
    await fixture.whenStable();
    expect(shown()).toBe('Petr Svoboda');

    await arrives('Petr Svoboda');
    stepping.set(false);
    await fixture.whenStable();

    expect(shown()).toBe('Petr Svoboda');
    expect(fades).toHaveLength(2);
  });

  it('when a step lets the late title go and no title arrives before the step ends, then the head shows its own title once the step has ended, never the last name', async () => {
    await arrives('Petr Svoboda');
    await fades[0].end();
    stepping.set(true);

    fixture.componentRef.setInput('lateTitle', null);
    await fixture.whenStable();
    stepping.set(false);
    await fixture.whenStable();
    await aFrameLater();

    expect(shown()).toBe('Dárce');
  });

  it('when the late title is let go during its fade under the same title of the head, then the head shows that title and the fade is let go', async () => {
    await arrives('Petr Svoboda');

    fixture.componentRef.setInput('lateTitle', null);
    await fixture.whenStable();
    await aFrameLater();
    await fades[0].end();

    expect(fades[0].cancelled).toBe(true);
    expect(shown()).toBe('Dárce');
  });

  it('when the title arrives on a window as wide as a computer’s, past the bar of tabs, then it shows at once, never faded', async () => {
    compact.set(false);
    await fixture.whenStable();

    await arrives('Petr Svoboda');

    expect(fades).toEqual([]);
    expect(shown()).toBe('Petr Svoboda');
  });

  it('when the title of the page is given with the page, then it shows at once, never faded', async () => {
    fixture.componentRef.setInput('title', 'Platby z banky');
    await fixture.whenStable();

    expect(fades).toEqual([]);
    expect(shown()).toBe('Platby z banky');
  });
});
