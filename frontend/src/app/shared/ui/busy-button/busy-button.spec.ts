import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Connectivity } from '../../../core/connectivity/connectivity';
import { NeedsConnection } from '../needs-connection/needs-connection';
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

@Component({
  imports: [BusyButton, NeedsConnection],
  template: `
    <button type="button" appNeedsConnection [appBusy]="busy()">Uložit nastavení</button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ConnectionHost {
  readonly busy = signal(false);
}

describe('Given a busy button that also needs a connection', () => {
  let fixture: ComponentFixture<ConnectionHost>;
  const offline = signal(false);

  beforeEach(async () => {
    offline.set(false);
    TestBed.configureTestingModule({
      providers: [{ provide: Connectivity, useValue: { offline } }],
    });
    fixture = TestBed.createComponent(ConnectionHost);
    document.body.append(fixture.nativeElement);
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture.destroy();
    (fixture.nativeElement as HTMLElement).remove();
  });

  const button = () =>
    (fixture.nativeElement as HTMLElement).querySelector('button') as HTMLButtonElement;
  const unavailable = () => button().getAttribute('aria-disabled');
  const hint = () => (fixture.nativeElement as HTMLElement).querySelector('.ui-needs-connection');

  async function set(change: { busy?: boolean; offline?: boolean }): Promise<void> {
    if (change.busy !== undefined) {
      fixture.componentInstance.busy.set(change.busy);
    }
    if (change.offline !== undefined) {
      offline.set(change.offline);
    }
    await fixture.whenStable();
  }

  it('when it is online and nothing runs, then it is plainly available', () => {
    expect(button().hasAttribute('aria-disabled')).toBe(false);
  });

  it('when the app is offline and nothing runs, then it says it is unavailable and why', async () => {
    await set({ offline: true });

    expect(unavailable()).toBe('true');
    expect(hint()?.textContent).toBe('Potřebuje připojení');
  });

  it('when the app opens offline, then the button is unavailable from the first view', async () => {
    fixture.destroy();
    (fixture.nativeElement as HTMLElement).remove();
    offline.set(true);
    fixture = TestBed.createComponent(ConnectionHost);
    document.body.append(fixture.nativeElement);
    await fixture.whenStable();

    expect(unavailable()).toBe('true');
  });

  it('when its request runs online, then it is unavailable without the offline hint', async () => {
    await set({ busy: true });

    expect(unavailable()).toBe('true');
    expect(hint()).toBeNull();
  });

  it('when the connection returns while the request still runs, then it stays unavailable until the request ends', async () => {
    await set({ busy: true, offline: true });

    await set({ offline: false });
    expect(unavailable()).toBe('true');
    expect(hint()).toBeNull();

    await set({ busy: false });
    expect(button().hasAttribute('aria-disabled')).toBe(false);
  });

  it('when the request ends while the app is offline, then it stays unavailable until the connection returns', async () => {
    await set({ busy: true, offline: true });

    await set({ busy: false });
    expect(unavailable()).toBe('true');
    expect(hint()?.textContent).toBe('Potřebuje připojení');

    await set({ offline: false });
    expect(button().hasAttribute('aria-disabled')).toBe(false);
  });
});
