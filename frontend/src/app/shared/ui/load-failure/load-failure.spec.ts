import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { LOADING_TIMINGS } from '../skeleton/loading-view';
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

@Component({
  imports: [LoadFailure],
  template: `
    <dialog open>
      <h2 id="account-section-title" tabindex="-1">Můj přehled</h2>
      <div class="content">
        @if (state() === 'error') {
          <app-load-failure [retrying]="retrying()" (retry)="retrying.set(true)"
            >Přehled darů se nepodařilo načíst.</app-load-failure
          >
        } @else {
          <p class="ready">Přehled darů</p>
        }
      </div>
    </dialog>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class PageInSheet {
  readonly state = signal<PageState>('error');
  readonly retrying = signal(false);
}

@Component({
  imports: [LoadFailure],
  template: `
    <dialog open>
      <h2 id="account-section-title" tabindex="-1">Údaje a zabezpečení</h2>
      <div class="content" tabindex="-1">
        <section class="passkeys" tabindex="-1" aria-label="Přístupové klíče">
          @if (state() === 'error') {
            <app-load-failure [retrying]="retrying()" (retry)="retrying.set(true)"
              >Přístupové klíče se nepodařilo načíst.</app-load-failure
            >
          } @else {
            <ul class="ready">
              <li>iPhone</li>
            </ul>
          }
        </section>
      </div>
    </dialog>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class DetailsInSheet {
  readonly state = signal<PageState>('error');
  readonly retrying = signal(false);
}

beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));

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
  const status = () => host().querySelector('app-load-failure [role="status"]');

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
    expect(button().getAttribute('aria-busy')).toBe('true');
    expect(button().textContent).toContain('Zkusit znovu');
    expect(shownFace()).toBe('Načítáme…');
    expect(status()?.textContent?.trim()).toBe('Načítáme…');
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
    expect(pressed.hasAttribute('aria-busy')).toBe(false);
    expect(status()?.textContent?.trim()).toBe('');
  });

  it('when the trying again fails once more, then a new alert says what failed, so a screen reader reads it again', async () => {
    const first = host().querySelector('[role="alert"]');
    button().click();
    await fixture.whenStable();

    fixture.componentInstance.retrying.set(false);
    await fixture.whenStable();

    const alerts = host().querySelectorAll('[role="alert"]');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).not.toBe(first);
    expect(alerts[0].textContent?.trim()).toBe('Stav záloh se nepodařilo načíst.');
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

  it('when the focus moves to the page heading, then the page does not scroll to it', async () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    button().click();
    await fixture.whenStable();
    focus.mockClear();

    fixture.componentInstance.retrying.set(false);
    fixture.componentInstance.state.set('ready');
    await fixture.whenStable();

    expect(focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    focus.mockRestore();
  });

  it('when the failure goes without a retry, then the focus is left where it was', async () => {
    fixture.componentInstance.state.set('ready');
    await fixture.whenStable();

    expect(document.activeElement).not.toBe(host().querySelector('h1'));
  });
});

describe('Given a section in the account sheet whose data failed to load', () => {
  let fixture: ComponentFixture<PageInSheet>;

  beforeEach(async () => {
    fixture = TestBed.createComponent(PageInSheet);
    document.body.append(fixture.nativeElement);
    await fixture.whenStable();
  });

  afterEach(() => (fixture.nativeElement as HTMLElement).remove());

  it('when the data arrive after „Zkusit znovu“, then the focus moves to the sheet title, not to the sheet itself', async () => {
    const host = fixture.nativeElement as HTMLElement;
    const button = host.querySelector('app-load-failure button') as HTMLButtonElement;
    button.focus();
    button.click();
    await fixture.whenStable();

    fixture.componentInstance.retrying.set(false);
    fixture.componentInstance.state.set('ready');
    await fixture.whenStable();

    expect(document.activeElement).toBe(host.querySelector('#account-section-title'));
  });
});

describe('Given the Údaje section in the account sheet whose passkeys failed to load', () => {
  let fixture: ComponentFixture<DetailsInSheet>;

  beforeEach(async () => {
    fixture = TestBed.createComponent(DetailsInSheet);
    document.body.append(fixture.nativeElement);
    await fixture.whenStable();
  });

  afterEach(() => (fixture.nativeElement as HTMLElement).remove());

  it('when the passkeys arrive after „Zkusit znovu“, then the focus moves to the passkeys region beside them, not to the sheet title', async () => {
    const host = fixture.nativeElement as HTMLElement;
    const button = host.querySelector('app-load-failure button') as HTMLButtonElement;
    button.focus();
    button.click();
    await fixture.whenStable();

    fixture.componentInstance.retrying.set(false);
    fixture.componentInstance.state.set('ready');
    await fixture.whenStable();

    expect(document.activeElement).toBe(host.querySelector('section.passkeys'));
  });
});

describe('Given a page whose data failed to load, with the theme timings of loading', () => {
  const DELAY_MS = 300;
  const MINIMUM_MS = 400;
  let fixture: ComponentFixture<Page>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: LOADING_TIMINGS,
          useValue: () => ({ delayMs: DELAY_MS, minimumMs: MINIMUM_MS, appearMs: 300 }),
        },
      ],
    });
    vi.useFakeTimers();
    fixture = TestBed.createComponent(Page);
    await settle();
  });

  afterEach(() => vi.useRealTimers());

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
  }

  async function wait(ms: number): Promise<void> {
    await vi.advanceTimersByTimeAsync(ms);
    fixture.detectChanges();
  }

  const host = () => fixture.nativeElement as HTMLElement;
  const button = () => host().querySelector('app-load-failure button') as HTMLButtonElement;

  it('when the trying again is refused at once, then the button stays busy for the loading delay and minimum and only then a new alert comes', async () => {
    const first = host().querySelector('[role="alert"]');
    button().click();
    await settle();
    fixture.componentInstance.retrying.set(false);
    await settle();

    await wait(DELAY_MS + MINIMUM_MS - 1);
    expect(button().getAttribute('aria-disabled')).toBe('true');
    expect(host().querySelector('[role="alert"]')).toBe(first);

    await wait(1);
    expect(button().hasAttribute('aria-disabled')).toBe(false);
    expect(host().querySelector('[role="alert"]')).not.toBe(first);
  });

  it('when the page is left while the button holds its busy state, then its timer is cancelled', async () => {
    button().click();
    await settle();
    fixture.componentInstance.retrying.set(false);
    await settle();
    expect(vi.getTimerCount()).toBe(1);

    fixture.destroy();
    await vi.advanceTimersToNextFrame();

    expect(vi.getTimerCount()).toBe(0);
  });
});
