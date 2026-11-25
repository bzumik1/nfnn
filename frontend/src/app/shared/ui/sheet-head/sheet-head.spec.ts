import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  SHEET_HEAD_ASKS_FOR_LESS_MOTION,
  SHEET_HEAD_RESIZE_OBSERVER,
  SheetHead,
} from './sheet-head';
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
  let lessMotion: boolean;

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
    lessMotion = false;
    await TestBed.configureTestingModule({
      imports: [SheetPanel],
      providers: [
        {
          provide: SHEET_HEAD_RESIZE_OBSERVER,
          useValue: WatchedSizes as unknown as typeof ResizeObserver,
        },
        { provide: SHEET_HEAD_ASKS_FOR_LESS_MOTION, useValue: () => lessMotion },
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
    let behaviours: (ScrollBehavior | undefined)[];

    beforeEach(() => {
      scrolled = [];
      behaviours = [];
      panel().scrollBy = ((options: ScrollToOptions) => {
        scrolled.push(options.top ?? 0);
        behaviours.push(options.behavior);
      }) as never;
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

    it('when the browser leaves a field it focused under the head and motion is allowed, then the panel glides it below the head', async () => {
      standAt(control('#below'), 130, 40);

      control('#below').focus();
      await nextFrame();

      expect(behaviours).toEqual(['smooth']);
    });

    it('when the browser leaves a field it focused under the head and the device asks for less motion, then the panel puts it below the head at once', async () => {
      lessMotion = true;
      standAt(control('#below'), 130, 40);

      control('#below').focus();
      await nextFrame();

      expect(behaviours).toEqual(['instant']);
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
    await TestBed.configureTestingModule({ imports: [SheetHead] }).compileComponents();
    const fixture = TestBed.createComponent(SheetHead);
    fixture.componentRef.setInput('title', 'Dárci');
    await fixture.whenStable();

    const around = (fixture.nativeElement as HTMLElement).parentElement!;
    expect(around.style.getPropertyValue('--sheet-head-height')).toBe('');
    expect(document.documentElement.style.getPropertyValue('--sheet-head-height')).toBe('');
  });
});
