import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SHEET_HEAD_RESIZE_OBSERVER, SheetHead } from './sheet-head';
import { withOrdinarySpaces } from '../../../../testing/ordinary-spaces';

@Component({
  imports: [SheetHead],
  template: `<div class="dialog-panel">
    @if (shown()) {
      <app-sheet-head title="Údaje a zabezpečení" />
    }
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
  let resized: (() => void)[];

  class WatchedSizes {
    constructor(private readonly callback: () => void) {}

    observe(): void {
      resized.push(this.callback);
    }

    disconnect(): void {
      resized = resized.filter((callback) => callback !== this.callback);
    }
  }

  beforeEach(async () => {
    resized = [];
    await TestBed.configureTestingModule({
      imports: [SheetPanel],
      providers: [
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

  it('when it is measured 64 px tall, then the panel knows its height, so a control scrolled into view stops below it', () => {
    Object.defineProperty(head()!, 'offsetHeight', { value: 64, configurable: true });

    resized.forEach((callback) => callback());

    expect(panel().style.getPropertyValue('--sheet-head-height')).toBe('64px');
  });

  it('when it leaves, then the panel forgets its height', async () => {
    fixture.componentInstance.shown.set(false);
    await fixture.whenStable();

    expect(head()).toBeNull();
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
