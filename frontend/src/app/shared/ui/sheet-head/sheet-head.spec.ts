import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SheetHead } from './sheet-head';

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
      expect(title?.textContent?.trim()).toBe('Můj přehled');
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
      expect(title?.textContent?.trim()).toBe('Můj přehled');
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
