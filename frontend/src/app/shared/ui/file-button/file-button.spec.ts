import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FileButton } from './file-button';

@Component({
  imports: [FileButton],
  template: `
    <app-file-button
      inputId="photo"
      accept="image/png"
      describedBy="photo-hint"
      [disabled]="busy()"
      (chosen)="files.push($event)"
      >Nahrát fotku</app-file-button
    >
  `,
})
class Host {
  readonly busy = signal(false);
  readonly files: File[] = [];
}

describe('Given a file button', () => {
  let fixture: ComponentFixture<Host>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  function input(): HTMLInputElement {
    return fixture.nativeElement.querySelector('input[type="file"]') as HTMLInputElement;
  }

  it('when it shows, then the file field is named by the visible button text and keeps its hint', () => {
    const label = fixture.nativeElement.querySelector(`label[for="photo"]`) as HTMLLabelElement;

    expect(label.textContent?.trim()).toBe('Nahrát fotku');
    expect(input().id).toBe('photo');
    expect(input().accept).toBe('image/png');
    expect(input().getAttribute('aria-describedby')).toBe('photo-hint');
  });

  it('when a file is chosen, then it is handed over and the field is emptied for the next choice', () => {
    const file = new File(['png'], 'zahrada.png', { type: 'image/png' });
    Object.defineProperty(input(), 'files', { value: [file], configurable: true });

    input().dispatchEvent(new Event('change'));

    expect(fixture.componentInstance.files).toEqual([file]);
    expect(input().value).toBe('');
  });

  it('when it is disabled, then the file field cannot be used', async () => {
    fixture.componentInstance.busy.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(input().disabled).toBe(true);
  });
});
