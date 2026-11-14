import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PdfButtonFace, PdfButtonState } from './pdf-button-face';

@Component({
  imports: [PdfButtonFace],
  template: `
    <button type="button" class="ui-button">
      <app-pdf-button-face
        [state]="state()"
        downloadLabel="Stáhnout PDF"
        preparingLabel="Připravujeme PDF…"
        openLabel="Otevřít PDF"
      />
      <span class="visually-hidden">, dar z 10. 1. 2026</span>
    </button>
  `,
})
class PdfButtonHost {
  readonly state = signal<PdfButtonState>('idle');
}

describe('Given the face of a PDF button', () => {
  let fixture: ComponentFixture<PdfButtonHost>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PdfButtonHost] }).compileComponents();
    fixture = TestBed.createComponent(PdfButtonHost);
    fixture.detectChanges();
  });

  const button = () => fixture.nativeElement.querySelector('button') as HTMLButtonElement;
  const text = () => (button().textContent ?? '').replace(/\s+/g, ' ').trim();
  const icon = () => button().querySelector('.pdf-button__icon') as HTMLElement;
  const reserves = () =>
    Array.from(button().querySelectorAll<HTMLElement>('.pdf-button__reserve')).map(
      (reserve) => reserve.dataset['label'],
    );

  function show(state: PdfButtonState): void {
    fixture.componentInstance.state.set(state);
    fixture.detectChanges();
  }

  it('when it waits, then it says Stáhnout PDF after a download icon hidden from screen readers', () => {
    expect(text()).toBe('Stáhnout PDF, dar z 10. 1. 2026');
    expect(icon().getAttribute('aria-hidden')).toBe('true');
    expect(icon().querySelector('.pdf-button__download')).not.toBeNull();
  });

  it('when it waits, then it reserves the room of every other label without saying them', () => {
    expect(reserves()).toEqual(['Připravujeme PDF…', 'Otevřít PDF', 'Zkusit znovu']);
    for (const reserve of button().querySelectorAll('.pdf-button__reserve')) {
      expect(reserve.textContent).toBe('');
      expect(reserve.getAttribute('aria-hidden')).toBe('true');
    }
  });

  describe('when the PDF is being prepared', () => {
    beforeEach(() => show('running'));

    it('then the icon turns into a ring without a percentage and the label says so', () => {
      expect(text()).toBe('Připravujeme PDF…, dar z 10. 1. 2026');
      expect(icon().querySelector('.pdf-button__ring')).not.toBeNull();
      expect(button().querySelector('progress')).toBeNull();
      expect(button().textContent).not.toMatch(/%/);
    });

    it('then it still reserves the room of the labels it does not show', () => {
      expect(reserves()).toEqual(['Stáhnout PDF', 'Otevřít PDF', 'Zkusit znovu']);
    });
  });

  it('when the PDF waits for a second tap, then a share icon stands before Otevřít PDF', () => {
    show('ready');

    expect(text()).toBe('Otevřít PDF, dar z 10. 1. 2026');
    expect(icon().querySelector('.pdf-button__share')).not.toBeNull();
  });

  it('when the PDF failed, then an exclamation icon stands before Zkusit znovu', () => {
    show('failed');

    expect(text()).toBe('Zkusit znovu, dar z 10. 1. 2026');
    expect(icon().querySelector('.pdf-button__warning')).not.toBeNull();
    expect(button().querySelector('.pdf-button--failed')).not.toBeNull();
  });
});
