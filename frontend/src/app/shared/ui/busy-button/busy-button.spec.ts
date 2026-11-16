import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BusyButton } from './busy-button';

@Component({
  imports: [BusyButton],
  template: `
    <form (submit)="send($event)">
      <button type="submit" [appBusy]="busy()" (click)="press()">Hledat</button>
    </form>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly busy = signal(false);
  pressed = 0;
  submitted = 0;

  press(): void {
    this.pressed++;
  }

  send(event: Event): void {
    event.preventDefault();
    this.submitted++;
  }
}

describe('Given a button whose request may be running', () => {
  let fixture: ComponentFixture<Host>;

  beforeEach(async () => {
    fixture = TestBed.createComponent(Host);
    document.body.append(fixture.nativeElement);
    await fixture.whenStable();
  });

  afterEach(() => (fixture.nativeElement as HTMLElement).remove());

  const button = () =>
    (fixture.nativeElement as HTMLElement).querySelector('button') as HTMLButtonElement;
  const form = () =>
    (fixture.nativeElement as HTMLElement).querySelector('form') as HTMLFormElement;

  async function setBusy(busy: boolean): Promise<void> {
    fixture.componentInstance.busy.set(busy);
    await fixture.whenStable();
  }

  function submit(): boolean {
    return form().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  }

  function pressKey(key: string): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    button().dispatchEvent(event);
    return event;
  }

  describe('when nothing runs', () => {
    it('then the button is plainly available and acts', () => {
      expect(button().hasAttribute('aria-disabled')).toBe(false);

      button().click();

      expect(fixture.componentInstance.pressed).toBe(1);
    });

    it('then its form is sent', () => {
      submit();

      expect(fixture.componentInstance.submitted).toBe(1);
    });

    it('then Enter and Space keep their activation', () => {
      expect(pressKey('Enter').defaultPrevented).toBe(false);
      expect(pressKey(' ').defaultPrevented).toBe(false);
    });
  });

  describe('when its request runs', () => {
    beforeEach(() => setBusy(true));

    it('then it says it is unavailable without switching the button off', () => {
      expect(button().getAttribute('aria-disabled')).toBe('true');
      expect(button().disabled).toBe(false);
    });

    it('then a click or a tap does nothing', () => {
      button().click();

      expect(fixture.componentInstance.pressed).toBe(0);
      expect(fixture.componentInstance.submitted).toBe(0);
    });

    it('then Enter and Space do nothing', () => {
      expect(pressKey('Enter').defaultPrevented).toBe(true);
      expect(pressKey(' ').defaultPrevented).toBe(true);
    });

    it('then its form is not sent', () => {
      expect(submit()).toBe(false);

      expect(fixture.componentInstance.submitted).toBe(0);
    });
  });

  it('when the request starts while the button has the focus, then the focus stays on it', async () => {
    button().focus();

    await setBusy(true);

    expect(document.activeElement).toBe(button());
  });

  it('when the request ends, then the button acts again', async () => {
    await setBusy(true);

    await setBusy(false);
    button().click();

    expect(button().hasAttribute('aria-disabled')).toBe(false);
    expect(fixture.componentInstance.pressed).toBe(1);
  });
});
