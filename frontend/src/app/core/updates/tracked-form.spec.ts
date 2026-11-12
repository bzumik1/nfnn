import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';

import { FocusFirstInvalid } from '../../shared/ui/form-field/focus-first-invalid';
import { DirtyForms } from './dirty-forms';
import { TrackedForm } from './tracked-form';

@Component({
  imports: [FormsModule, TrackedForm, FocusFirstInvalid],
  template: `
    @if (shown()) {
      <form appFocusFirstInvalid>
        <label for="message">Zpráva</label>
        <input id="message" name="message" [(ngModel)]="message" />
      </form>
    }
    <form appTrackedForm>
      <label for="name">Jméno</label>
      <input id="name" name="name" [(ngModel)]="name" />
    </form>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class TwoForms {
  readonly shown = signal(true);
  message = '';
  name = '';
}

describe('Given a page with two tracked forms', () => {
  let fixture: ComponentFixture<TwoForms>;
  let dirtyForms: DirtyForms;

  function type(id: string, text: string): void {
    const input = fixture.nativeElement.querySelector(`#${id}`) as HTMLInputElement;
    input.value = text;
    input.dispatchEvent(new Event('input'));
  }

  beforeEach(async () => {
    fixture = TestBed.createComponent(TwoForms);
    await fixture.whenStable();
    dirtyForms = TestBed.inject(DirtyForms);
  });

  it('when nothing is typed, then nothing is half-typed', () => {
    expect(dirtyForms.any()).toBe(false);
  });

  it('when a field of a form that focuses its first invalid field is typed into, then the page holds a half-typed form', () => {
    type('message', 'Dobrý den');

    expect(dirtyForms.any()).toBe(true);
  });

  it('when a field of a form marked as tracked is typed into, then the page holds a half-typed form', () => {
    type('name', 'Jana');

    expect(dirtyForms.any()).toBe(true);
  });

  it('when the half-typed form leaves the page, then nothing is half-typed', async () => {
    type('message', 'Dobrý den');

    fixture.componentInstance.shown.set(false);
    await fixture.whenStable();

    expect(dirtyForms.any()).toBe(false);
  });

  it('when the page holding the half-typed form is kept out of view while another tab is shown, then nothing in view is half-typed', () => {
    type('message', 'Dobrý den');
    const page = fixture.nativeElement as HTMLElement;
    const place = page.parentElement!;

    page.remove();

    expect(dirtyForms.any()).toBe(false);
    place.append(page);
    expect(dirtyForms.any()).toBe(true);
  });
});
