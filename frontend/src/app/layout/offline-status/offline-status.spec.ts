import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { OFFLINE_AFTER_MS, PROBE_PATH } from '../../core/connectivity/connectivity';
import { connectivityInterceptor } from '../../core/connectivity/connectivity-interceptor';
import { OfflineStatus } from './offline-status';

const NOW = Date.parse('2026-11-05T11:30:00Z');
const HOME_WRITTEN = new Date('2026-11-05T09:05:00Z');

describe('Given the offline status of the app', () => {
  let fixture: ComponentFixture<OfflineStatus>;
  let client: HttpClient;
  let http: HttpTestingController;

  beforeEach(async () => {
    vi.useFakeTimers({
      now: NOW,
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
    });
    await TestBed.configureTestingModule({
      imports: [OfflineStatus],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([connectivityInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(OfflineStatus);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture.destroy();
    fixture.nativeElement.remove();
    document.querySelectorAll('dialog').forEach((dialog) => dialog.remove());
    http.verify();
    vi.useRealTimers();
  });

  const element = () => fixture.nativeElement as HTMLElement;
  const announced = () =>
    element().querySelector('[aria-live="polite"]')?.textContent?.replace(/\s+/g, ' ').trim();
  const pill = () =>
    Array.from(element().querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Offline'),
    );
  const sheet = () => document.querySelector('dialog[open]') as HTMLDialogElement | null;
  const textOf = (node: Element | null | undefined) =>
    node?.textContent?.replace(/\s+/g, ' ').trim();

  function homeArrives(): void {
    client.get('/api/content/home').subscribe();
    http
      .expectOne('/api/content/home')
      .flush({}, { headers: { Date: HOME_WRITTEN.toUTCString() } });
    http.expectOne(PROBE_PATH).flush({});
  }

  async function nothingAnswers(status = 0): Promise<void> {
    client.get('/api/donors/me').subscribe({ error: () => undefined });
    fail(http.expectOne('/api/donors/me'), status);
    fail(http.expectOne(PROBE_PATH), status);
    vi.advanceTimersByTime(OFFLINE_AFTER_MS);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function fail(request: TestRequest, status: number): void {
    if (status === 0) {
      request.error(new ProgressEvent('error'), { status: 0, statusText: '' });
    } else {
      request.flush('<html></html>', {
        status,
        statusText: 'Origin unreachable',
        headers: { 'Content-Type': 'text/html' },
      });
    }
  }

  it('when the app is online, then nothing is shown and nothing is announced', () => {
    expect(pill()).toBeUndefined();
    expect(announced()).toBe('');
  });

  it('when a request fails for less than 3 s, then nothing is shown yet', () => {
    client.get('/api/donors/me').subscribe({ error: () => undefined });
    http.expectOne('/api/donors/me').error(new ProgressEvent('error'), { status: 0 });
    http.expectOne(PROBE_PATH).error(new ProgressEvent('error'), { status: 0 });
    vi.advanceTimersByTime(OFFLINE_AFTER_MS - 1);
    fixture.detectChanges();

    expect(pill()).toBeUndefined();
  });

  describe('when the app goes offline on a page whose data came at 10:05 Prague time', () => {
    beforeEach(async () => {
      homeArrives();
      await nothingAnswers();
    });

    it('then a button says it is offline with the time of the data', () => {
      expect(textOf(pill())).toBe('Offline · údaje z 10:05');
      expect(pill()?.getAttribute('aria-haspopup')).toBe('dialog');
    });

    it('then the change is announced once, with the time of the data', () => {
      expect(announced()).toBe('Jste offline. Zobrazujeme údaje z 10:05.');
    });

    it('and the button is pressed, then a sheet says that offline the visitor can only look, and that the data may not be current', async () => {
      pill()!.click();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(textOf(sheet()?.querySelector('h2'))).toBe('Jste offline');
      expect(textOf(sheet())).toContain('Bez připojení můžete jen prohlížet.');
      expect(textOf(sheet())).toContain('Zobrazujeme údaje z 10:05, nemusí být aktuální.');
    });

    it('and the visitor tries again while the network is still gone, then the sheet says so', async () => {
      pill()!.click();
      fixture.detectChanges();
      await fixture.whenStable();
      const tryAgain = Array.from(sheet()!.querySelectorAll('button')).find(
        (button) => textOf(button) === 'Zkusit znovu',
      )!;

      tryAgain.click();
      fixture.detectChanges();
      expect(textOf(tryAgain)).toBe('Zkoušíme se připojit…');
      http.expectOne(PROBE_PATH).error(new ProgressEvent('error'), { status: 0 });
      fixture.detectChanges();
      await fixture.whenStable();

      expect(textOf(sheet()?.querySelector('[role="status"].offline-sheet-status'))).toBe(
        'Pořád se nedaří připojit. Zkusíme to znovu samo za chvíli.',
      );
    });

    it('and the visitor tries again and the server answers, then the button goes, the sheet says the connection is back and so does the announcement', async () => {
      pill()!.click();
      fixture.detectChanges();
      await fixture.whenStable();
      Array.from(sheet()!.querySelectorAll('button'))
        .find((button) => textOf(button) === 'Zkusit znovu')!
        .click();
      http.expectOne(PROBE_PATH).flush({});
      fixture.detectChanges();
      await fixture.whenStable();

      expect(pill()).toBeUndefined();
      expect(textOf(sheet()?.querySelector('h2'))).toBe('Jste připojeni');
      expect(textOf(sheet()?.querySelector('.offline-sheet-status'))).toBe('Připojení je zpět.');
    });
  });

  it('when the server does not answer while the device is online, then the sheet says the server does not answer', async () => {
    await nothingAnswers(522);
    expect(textOf(pill())).toBe('Offline');
    expect(announced()).toBe('Server fondu teď neodpovídá.');

    pill()!.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(textOf(sheet()?.querySelector('h2'))).toBe('Server neodpovídá');
    expect(textOf(sheet())).toContain('Server fondu teď neodpovídá; zkuste to za chvíli.');
  });

  it('when the app comes back online by itself, then the button goes and the return is announced', async () => {
    await nothingAnswers();
    client.get('/api/content/news').subscribe();
    http.expectOne('/api/content/news').flush([]);
    vi.advanceTimersByTime(30_000);
    http.expectOne(PROBE_PATH).flush({});
    fixture.detectChanges();
    await fixture.whenStable();

    expect(pill()).toBeUndefined();
    expect(announced()).toBe('Připojení je zpět.');
  });
});
