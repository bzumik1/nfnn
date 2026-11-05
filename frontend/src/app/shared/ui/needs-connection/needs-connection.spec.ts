import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';

import { Connectivity } from '../../../core/connectivity/connectivity';
import { NeedsConnection } from './needs-connection';

@Component({
  imports: [FormsModule, NeedsConnection],
  template: `
    <form (ngSubmit)="submitted = submitted + 1">
      <input id="message" name="message" [(ngModel)]="message" />
      <p id="send-hint">Odpovíme do týdne.</p>
      <button type="submit" appNeedsConnection aria-describedby="send-hint">Odeslat</button>
    </form>
    <button type="button" class="remove" appNeedsConnection (click)="removed = removed + 1">
      Odebrat
    </button>
    <button type="button" class="busy" appNeedsConnection aria-disabled="false">Obnovit</button>
  `,
})
class Host {
  message = 'Dobrý den';
  submitted = 0;
  removed = 0;
}

describe('Given a control that needs a connection', () => {
  let fixture: ComponentFixture<Host>;
  const offline = signal(false);

  beforeEach(async () => {
    offline.set(false);
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [{ provide: Connectivity, useValue: { offline } }],
    }).compileComponents();
    fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture.destroy();
    fixture.nativeElement.remove();
  });

  const element = () => fixture.nativeElement as HTMLElement;
  const send = () => element().querySelector('button[type="submit"]') as HTMLButtonElement;
  const remove = () => element().querySelector('button.remove') as HTMLButtonElement;
  const hints = () => Array.from(element().querySelectorAll('.ui-needs-connection'));

  async function connection(online: boolean): Promise<void> {
    offline.set(!online);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('when the app is online, then the control works and says nothing more', () => {
    send().click();
    remove().click();

    expect(fixture.componentInstance.submitted).toBe(1);
    expect(fixture.componentInstance.removed).toBe(1);
    expect(send().hasAttribute('aria-disabled')).toBe(false);
    expect(send().getAttribute('aria-describedby')).toBe('send-hint');
    expect(hints()).toHaveLength(0);
  });

  describe('when the app is offline', () => {
    beforeEach(() => connection(false));

    it('then the control stays focusable but says it is unavailable and why, beside it and to a screen reader', () => {
      send().focus();

      expect(document.activeElement).toBe(send());
      expect(send().disabled).toBe(false);
      expect(send().getAttribute('aria-disabled')).toBe('true');
      const hint = send().nextElementSibling as HTMLElement;
      expect(hint.textContent).toBe('Potřebuje připojení');
      expect(send().getAttribute('aria-describedby')).toBe(`send-hint ${hint.id}`);
    });

    it('then pressing it does nothing, so no request starts that cannot arrive', () => {
      send().click();
      remove().click();

      expect(fixture.componentInstance.submitted).toBe(0);
      expect(fixture.componentInstance.removed).toBe(0);
    });

    it('then Enter in a field of its form submits nothing and what was typed stays', () => {
      const field = element().querySelector('#message') as HTMLInputElement;
      field.form!.requestSubmit();

      expect(fixture.componentInstance.submitted).toBe(0);
      expect(field.value).toBe('Dobrý den');
    });

    it('and the connection comes back, then the control is as before and works again', async () => {
      await connection(true);

      expect(send().hasAttribute('aria-disabled')).toBe(false);
      expect(send().getAttribute('aria-describedby')).toBe('send-hint');
      expect(hints()).toHaveLength(0);
      send().click();
      expect(fixture.componentInstance.submitted).toBe(1);
    });

    it('and the connection comes back, then a control that said it was enabled says so again', async () => {
      const busy = element().querySelector('button.busy') as HTMLButtonElement;
      expect(busy.getAttribute('aria-disabled')).toBe('true');

      await connection(true);

      expect(busy.getAttribute('aria-disabled')).toBe('false');
    });

    it('and it stays offline, then each control has one hint of its own', async () => {
      await connection(false);

      expect(hints()).toHaveLength(3);
      expect(new Set(hints().map((hint) => hint.id)).size).toBe(3);
    });
  });
});
