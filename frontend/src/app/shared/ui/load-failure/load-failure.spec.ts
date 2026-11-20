import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LoadFailure } from './load-failure';

type PageState = 'error' | 'ready';

@Component({
  imports: [LoadFailure],
  template: `
    <main id="obsah" tabindex="-1">
      <h1 tabindex="-1">Zálohy</h1>
      <div class="content">
        @if (state() === 'error') {
          <app-load-failure [retrying]="retrying()" (retry)="retry()"
            >Stav záloh se nepodařilo načíst.</app-load-failure
          >
        } @else {
          <p class="ready">Stav záloh</p>
        }
      </div>
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Page {
  readonly state = signal<PageState>('error');
  readonly retrying = signal(false);
  retries = 0;

  retry(): void {
    this.retries++;
    this.retrying.set(true);
  }
}

describe('Given a page whose data failed to load', () => {
  let fixture: ComponentFixture<Page>;

  beforeEach(async () => {
    fixture = TestBed.createComponent(Page);
    document.body.append(fixture.nativeElement);
    await fixture.whenStable();
  });

  afterEach(() => (fixture.nativeElement as HTMLElement).remove());

  const host = () => fixture.nativeElement as HTMLElement;
  const button = () => host().querySelector('app-load-failure button') as HTMLButtonElement;
  const shownFace = () =>
    button().querySelector('.busy-label__face--shown')?.textContent?.trim() ?? '';

  it('when it shows, then one alert says only what failed and its block holds the retry button beside it', () => {
    const alerts = host().querySelectorAll('[role="alert"]');
    expect(alerts).toHaveLength(1);
    expect(alerts[0].textContent?.trim()).toBe('Stav záloh se nepodařilo načíst.');
    expect(alerts[0].parentElement?.contains(button())).toBe(true);
    expect(shownFace()).toBe('Zkusit znovu');
  });

  it('when they press „Zkusit znovu“, then the button stays focused and says it is loading while the page tries again', async () => {
    button().focus();
    button().click();
    await fixture.whenStable();

    expect(fixture.componentInstance.retries).toBe(1);
    expect(document.activeElement).toBe(button());
    expect(button().getAttribute('aria-disabled')).toBe('true');
    expect(shownFace()).toBe('Načítáme…');
  });

  it('when the trying again fails once more, then the same button keeps the focus and offers to try again', async () => {
    const pressed = button();
    pressed.focus();
    pressed.click();
    await fixture.whenStable();

    fixture.componentInstance.retrying.set(false);
    await fixture.whenStable();

    expect(button()).toBe(pressed);
    expect(document.activeElement).toBe(pressed);
    expect(pressed.hasAttribute('aria-disabled')).toBe(false);
  });

  it('when the data then arrive in place of the failure, then the focus moves to the page heading instead of being lost', async () => {
    button().focus();
    button().click();
    await fixture.whenStable();

    fixture.componentInstance.retrying.set(false);
    fixture.componentInstance.state.set('ready');
    await fixture.whenStable();

    expect(host().querySelector('.ready')).not.toBeNull();
    expect(document.activeElement).toBe(host().querySelector('h1'));
  });

  it('when the failure goes without a retry, then the focus is left where it was', async () => {
    fixture.componentInstance.state.set('ready');
    await fixture.whenStable();

    expect(document.activeElement).not.toBe(host().querySelector('h1'));
  });
});
