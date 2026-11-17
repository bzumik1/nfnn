import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BusyLabel } from './busy-label';
import { accessibleText } from './testing/accessible-text';

@Component({
  imports: [BusyLabel],
  template: `
    <button type="button" class="ui-button">
      <app-busy-label [busy]="saving()">
        <span when-idle>Uložit nastavení</span>
        <span when-busy>Ukládáme…</span>
      </app-busy-label>
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly saving = signal(false);
}

describe('Given a button whose label says when it saves', () => {
  let fixture: ComponentFixture<Host>;

  beforeEach(async () => {
    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
  });

  const button = () =>
    (fixture.nativeElement as HTMLElement).querySelector('button') as HTMLElement;
  const faces = () => Array.from(button().querySelectorAll<HTMLElement>('.busy-label__face'));

  async function setSaving(saving: boolean): Promise<void> {
    fixture.componentInstance.saving.set(saving);
    await fixture.whenStable();
  }

  it('when nothing runs, then its name is the resting label alone', () => {
    expect(accessibleText(button())).toBe('Uložit nastavení');
  });

  it('when nothing runs, then both labels stand in the button, so it keeps the width of the longer one', () => {
    expect(faces().map((face) => face.textContent?.trim())).toEqual([
      'Uložit nastavení',
      'Ukládáme…',
    ]);
    expect(faces()[0].parentElement).toBe(faces()[1].parentElement);
  });

  describe("when it starts saving without the theme's loading delay", () => {
    beforeEach(() => setSaving(true));

    it('then its name changes at once to the saving label alone', () => {
      expect(accessibleText(button())).toBe('Ukládáme…');
    });

    it('then the resting label keeps its room but is hidden from screen readers', () => {
      expect(faces()[0].textContent?.trim()).toBe('Uložit nastavení');
      expect(faces()[0].getAttribute('aria-hidden')).toBe('true');
      expect(faces()[1].hasAttribute('aria-hidden')).toBe(false);
    });

    it('then nothing on the button announces itself', () => {
      expect(button().querySelector('[aria-live], [role="status"], [role="alert"]')).toBeNull();
      expect(button().hasAttribute('aria-live')).toBe(false);
    });
  });

  it('when it starts saving while the button has the focus, then the focus stays on the button', async () => {
    document.body.append(fixture.nativeElement);
    button().focus();

    await setSaving(true);

    expect(document.activeElement).toBe(button());
    (fixture.nativeElement as HTMLElement).remove();
  });

  it('when the save ends, then its name is the resting label again', async () => {
    await setSaving(true);

    await setSaving(false);

    expect(accessibleText(button())).toBe('Uložit nastavení');
    expect(faces()[1].getAttribute('aria-hidden')).toBe('true');
  });

  describe("with the theme's loading delay", () => {
    beforeEach(async () => {
      vi.useFakeTimers();
      document.documentElement.style.setProperty('--delay-loading', '0.3s');
      fixture.destroy();
      fixture = TestBed.createComponent(Host);
      fixture.detectChanges();
    });

    afterEach(() => {
      document.documentElement.style.removeProperty('--delay-loading');
      vi.useRealTimers();
    });

    async function saving(value: boolean): Promise<void> {
      fixture.componentInstance.saving.set(value);
      await wait(0);
    }

    async function wait(ms: number): Promise<void> {
      await vi.advanceTimersByTimeAsync(ms);
      fixture.detectChanges();
    }

    it('when it starts saving, then its name stays the resting label until the delay is over', async () => {
      await saving(true);
      await wait(299);

      expect(accessibleText(button())).toBe('Uložit nastavení');
      expect(faces()[1].getAttribute('aria-hidden')).toBe('true');

      await wait(1);

      expect(accessibleText(button())).toBe('Ukládáme…');
      expect(faces()[0].getAttribute('aria-hidden')).toBe('true');
    });

    it('when the save ends before the delay is over, then the saving label never shows', async () => {
      await saving(true);
      await wait(200);
      await saving(false);

      await wait(500);

      expect(accessibleText(button())).toBe('Uložit nastavení');
      expect(faces()[1].getAttribute('aria-hidden')).toBe('true');
    });

    it('when the save ends after the saving label showed, then the resting label is back at once', async () => {
      await saving(true);
      await wait(300);

      await saving(false);

      expect(accessibleText(button())).toBe('Uložit nastavení');
    });

    it('when a second save starts soon after a fast one, then it waits the whole delay again', async () => {
      await saving(true);
      await wait(200);
      await saving(false);
      await saving(true);

      await wait(200);

      expect(accessibleText(button())).toBe('Uložit nastavení');

      await wait(100);

      expect(accessibleText(button())).toBe('Ukládáme…');
    });
  });
});
