import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BusyAnnouncement } from './busy-announcement';
import { BusyLabel } from './busy-label';
import { accessibleText } from './testing/accessible-text';
import { withOrdinarySpaces } from '../../../../testing/ordinary-spaces';

@Component({
  imports: [BusyLabel],
  providers: [BusyAnnouncement],
  template: `
    <button type="button" class="ui-button">
      <app-busy-label [busy]="saving()">
        <span when-idle>Uložit nastavení</span>
        <span when-busy>Ukládáme…</span>
      </app-busy-label>
    </button>
    <p class="card-status" role="status">
      @if (announcement.text(); as starting) {
        <span class="visually-hidden">{{ starting }}</span>
      } @else if (result()) {
        <span>{{ result() }}</span>
      }
    </p>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly saving = signal(false);
  readonly result = signal('');
  protected readonly announcement = inject(BusyAnnouncement);
}

describe('Given a button whose label says when it saves, inside a card with a status line', () => {
  let fixture: ComponentFixture<Host>;

  beforeEach(async () => {
    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
  });

  const root = () => fixture.nativeElement as HTMLElement;
  const button = () => root().querySelector('button') as HTMLElement;
  const faces = () => Array.from(button().querySelectorAll<HTMLElement>('.busy-label__face'));
  const shownFace = () =>
    withOrdinarySpaces(button().querySelector('.busy-label__face--shown')?.textContent)?.trim();
  const status = () => root().querySelector('.card-status') as HTMLElement;
  const statusText = () => (withOrdinarySpaces(status().textContent) ?? '').trim();

  async function setSaving(saving: boolean): Promise<void> {
    fixture.componentInstance.saving.set(saving);
    await fixture.whenStable();
  }

  async function finish(result: string): Promise<void> {
    fixture.componentInstance.result.set(result);
    await setSaving(false);
  }

  it('when nothing runs, then its name is the resting label, it is not busy and the status line is empty', () => {
    expect(accessibleText(button())).toBe('Uložit nastavení');
    expect(button().hasAttribute('aria-busy')).toBe(false);
    expect(statusText()).toBe('');
  });

  it('when nothing runs, then both labels stand in the button, so it keeps the width of the longer one, and the busy one is hidden from screen readers', () => {
    expect(faces().map((face) => withOrdinarySpaces(face.textContent)?.trim())).toEqual([
      'Uložit nastavení',
      'Ukládáme…',
    ]);
    expect(faces()[0].parentElement).toBe(faces()[1].parentElement);
    expect(faces()[1].getAttribute('aria-hidden')).toBe('true');
  });

  describe("when it starts saving without the theme's loading delay", () => {
    beforeEach(() => setSaving(true));

    it('then the button is busy but keeps its resting name, and shows the saving label', () => {
      expect(button().getAttribute('aria-busy')).toBe('true');
      expect(accessibleText(button())).toBe('Uložit nastavení');
      expect(shownFace()).toBe('Ukládáme…');
      expect(faces()[0].hasAttribute('aria-hidden')).toBe(false);
      expect(faces()[1].getAttribute('aria-hidden')).toBe('true');
    });

    it("then the card's status line says the saving label for screen readers only", () => {
      expect(statusText()).toBe('Ukládáme…');
      expect(
        withOrdinarySpaces(status().querySelector('.visually-hidden')?.textContent)?.trim(),
      ).toBe('Ukládáme…');
    });

    it('then nothing on the button announces itself', () => {
      expect(button().querySelector('[aria-live], [role="status"], [role="alert"]')).toBeNull();
      expect(button().hasAttribute('aria-live')).toBe(false);
    });

    it('and it ends, then the result replaces the saving label in the status line, the button is no longer busy and its name is its visible label', async () => {
      await finish('Nastavení jsme uložili.');

      expect(statusText()).toBe('Nastavení jsme uložili.');
      expect(button().hasAttribute('aria-busy')).toBe(false);
      expect(accessibleText(button())).toBe('Uložit nastavení');
      expect(shownFace()).toBe('Uložit nastavení');
    });
  });

  it('when it starts saving while the button has the focus, then the focus stays on the button', async () => {
    document.body.append(fixture.nativeElement);
    button().focus();

    await setSaving(true);

    expect(document.activeElement).toBe(button());
    (fixture.nativeElement as HTMLElement).remove();
  });

  describe("with the theme's loading delay", () => {
    let heard: string[];

    beforeEach(() => {
      vi.useFakeTimers();
      document.documentElement.style.setProperty('--delay-loading', '0.3s');
      fixture.destroy();
      fixture = TestBed.createComponent(Host);
      fixture.detectChanges();
      heard = [];
      new MutationObserver(() => heard.push(statusText())).observe(status(), {
        subtree: true,
        childList: true,
        characterData: true,
      });
    });

    afterEach(() => {
      document.documentElement.style.removeProperty('--delay-loading');
      vi.useRealTimers();
    });

    async function wait(ms: number): Promise<void> {
      await vi.advanceTimersByTimeAsync(ms);
      fixture.detectChanges();
    }

    async function saving(value: boolean): Promise<void> {
      fixture.componentInstance.saving.set(value);
      await wait(0);
    }

    it('when it starts saving, then the button is busy at once while the label and the status line wait for the delay and then change together', async () => {
      await saving(true);
      await wait(299);

      expect(button().getAttribute('aria-busy')).toBe('true');
      expect(accessibleText(button())).toBe('Uložit nastavení');
      expect(shownFace()).toBe('Uložit nastavení');
      expect(statusText()).toBe('');

      await wait(1);

      expect(shownFace()).toBe('Ukládáme…');
      expect(statusText()).toBe('Ukládáme…');
      expect(accessibleText(button())).toBe('Uložit nastavení');
    });

    it('when the save ends before the delay is over, then the status line says only the result', async () => {
      await saving(true);
      await wait(200);
      fixture.componentInstance.result.set('Nastavení jsme uložili.');
      await saving(false);

      await wait(500);

      expect(heard.filter((text) => text !== '')).toEqual(['Nastavení jsme uložili.']);
      expect(shownFace()).toBe('Uložit nastavení');
    });

    it('when the save ends after the delay, then the status line says the saving label and then only the result', async () => {
      await saving(true);
      await wait(300);
      fixture.componentInstance.result.set('Nastavení jsme uložili.');
      await saving(false);

      expect(heard.filter((text) => text !== '')).toEqual(['Ukládáme…', 'Nastavení jsme uložili.']);
      expect(shownFace()).toBe('Uložit nastavení');
      expect(button().hasAttribute('aria-busy')).toBe(false);
    });

    it('when a second save starts soon after a fast one, then it waits the whole delay again', async () => {
      await saving(true);
      await wait(200);
      await saving(false);
      await saving(true);

      await wait(200);

      expect(shownFace()).toBe('Uložit nastavení');
      expect(statusText()).toBe('');

      await wait(100);

      expect(shownFace()).toBe('Ukládáme…');
      expect(statusText()).toBe('Ukládáme…');
    });
  });
});

@Component({
  imports: [BusyLabel],
  template: `
    <button type="button" class="ui-button">
      <app-busy-label [busy]="saving()">
        <span when-idle>Odeslat zprávu</span>
        <span when-busy>Odesíláme…</span>
      </app-busy-label>
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class HostWithoutStatusLine {
  readonly saving = signal(false);
}

@Component({
  imports: [BusyLabel],
  providers: [BusyAnnouncement],
  template: `
    @if (shown()) {
      <button type="button" class="ui-button">
        <app-busy-label [busy]="saving()">
          <span when-idle>Změnit heslo</span>
          <span when-busy>Ukládáme…</span>
        </app-busy-label>
      </button>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class LeavingHost {
  readonly shown = signal(true);
  readonly saving = signal(false);
}

describe('Given a busy button in a form that leaves when its work ends', () => {
  it('when the form goes in the same update in which the work ends, then the button is no longer busy while it leaves', async () => {
    const fixture = TestBed.createComponent(LeavingHost);
    await fixture.whenStable();
    fixture.componentInstance.saving.set(true);
    await fixture.whenStable();
    const button = (fixture.nativeElement as HTMLElement).querySelector('button') as HTMLElement;
    expect(button.getAttribute('aria-busy')).toBe('true');

    fixture.componentInstance.saving.set(false);
    fixture.componentInstance.shown.set(false);
    await fixture.whenStable();

    expect(button.hasAttribute('aria-busy')).toBe(false);
  });
});

describe('Given a button whose label says when it sends, where no status line announces the start', () => {
  let fixture: ComponentFixture<HostWithoutStatusLine>;

  const button = () =>
    (fixture.nativeElement as HTMLElement).querySelector('button') as HTMLElement;
  const faces = () => Array.from(button().querySelectorAll<HTMLElement>('.busy-label__face'));

  describe("without the theme's loading delay", () => {
    beforeEach(async () => {
      fixture = TestBed.createComponent(HostWithoutStatusLine);
      await fixture.whenStable();
    });

    async function setSaving(saving: boolean): Promise<void> {
      fixture.componentInstance.saving.set(saving);
      await fixture.whenStable();
    }

    it('when nothing runs, then its name is the resting label and the sending label is hidden from screen readers', () => {
      expect(accessibleText(button())).toBe('Odeslat zprávu');
      expect(faces()[1].getAttribute('aria-hidden')).toBe('true');
    });

    it('when it starts sending, then its name is the sending label, the resting one is hidden from screen readers and the button carries no aria-busy', async () => {
      await setSaving(true);

      expect(accessibleText(button())).toBe('Odesíláme…');
      expect(faces()[0].getAttribute('aria-hidden')).toBe('true');
      expect(faces()[1].hasAttribute('aria-hidden')).toBe(false);
      expect(button().hasAttribute('aria-busy')).toBe(false);
    });

    it('when the sending ends, then its name is the resting label again', async () => {
      await setSaving(true);

      await setSaving(false);

      expect(accessibleText(button())).toBe('Odeslat zprávu');
      expect(faces()[1].getAttribute('aria-hidden')).toBe('true');
    });
  });

  describe("with the theme's loading delay", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      document.documentElement.style.setProperty('--delay-loading', '0.3s');
      fixture = TestBed.createComponent(HostWithoutStatusLine);
      fixture.detectChanges();
    });

    afterEach(() => {
      document.documentElement.style.removeProperty('--delay-loading');
      vi.useRealTimers();
    });

    async function wait(ms: number): Promise<void> {
      await vi.advanceTimersByTimeAsync(ms);
      fixture.detectChanges();
    }

    it('when it starts sending, then its name stays the resting label until the delay is over and then is the sending label', async () => {
      fixture.componentInstance.saving.set(true);
      await wait(299);

      expect(accessibleText(button())).toBe('Odeslat zprávu');

      await wait(1);

      expect(accessibleText(button())).toBe('Odesíláme…');
      expect(button().hasAttribute('aria-busy')).toBe(false);
    });
  });
});
