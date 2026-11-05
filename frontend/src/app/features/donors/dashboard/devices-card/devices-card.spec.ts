import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { authInterceptor } from '../../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../../core/auth/auth-store';
import { SignedInDevice } from '../../../../core/auth/donor';
import { authResponse, problem, sampleDonor } from '../../../../core/auth/testing/donor-fixtures';
import { DevicesCard } from './devices-card';

const DEVICES_URL = '/api/donors/me/devices';
const THIS_MAC: SignedInDevice = {
  id: '019a5a3c-0000-7000-8000-000000000001',
  platform: 'MAC',
  browser: 'FIREFOX',
  signedInAt: '2026-11-01T07:00:00Z',
  lastUsedAt: '2026-11-05T09:30:00Z',
  current: true,
};
const IPHONE: SignedInDevice = {
  id: '019a5a3c-0000-7000-8000-000000000002',
  platform: 'IPHONE',
  browser: 'SAFARI',
  signedInAt: '2026-10-30T18:00:00Z',
  lastUsedAt: '2026-11-04T19:05:00Z',
  current: false,
};
const UNKNOWN: SignedInDevice = {
  id: '019a5a3c-0000-7000-8000-000000000003',
  platform: 'OTHER',
  browser: 'OTHER',
  signedInAt: '2026-10-29T10:00:00Z',
  lastUsedAt: '2026-10-29T10:00:00Z',
  current: false,
};

describe("Given a donor's signed-in devices card", () => {
  let fixture: ComponentFixture<DevicesCard>;
  let http: HttpTestingController;
  let sessionEnded: number;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DevicesCard],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthStore).login('jana@example.cz', 'correct horse battery').subscribe();
    http.expectOne('/api/donors/auth/login').flush(authResponse('token-1', sampleDonor()));
    fixture = TestBed.createComponent(DevicesCard);
    sessionEnded = 0;
    fixture.componentInstance.sessionEnded.subscribe(() => sessionEnded++);
    await settle();
  });

  afterEach(() => http.verify());

  const root = () => fixture.nativeElement as HTMLElement;

  function element<T extends HTMLElement>(selector: string): T {
    return root().querySelector(selector) as T;
  }

  function rows(): HTMLElement[] {
    return Array.from(root().querySelectorAll<HTMLElement>('.device'));
  }

  function text(node: Element | null): string {
    return (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function listed(devices: SignedInDevice[]): Promise<void> {
    http.expectOne(DEVICES_URL).flush({ items: devices });
    await settle();
  }

  it('when the list is loading, then the card says so under its own heading', () => {
    expect(text(element('h2'))).toBe('Přihlášená zařízení');
    expect(text(element('[role="status"]'))).toContain('Načítáme přihlášená zařízení');
    http.expectOne(DEVICES_URL).flush({ items: [THIS_MAC] });
  });

  describe('when three devices are signed in', () => {
    beforeEach(async () => listed([THIS_MAC, IPHONE, UNKNOWN]));

    it('then each row names the device, the browser and the times in Prague', () => {
      expect(rows().map((row) => text(row.querySelector('.device-name')))).toEqual([
        'Mac · Firefox',
        'iPhone · Safari',
        'Neznámé zařízení',
      ]);
      expect(text(rows()[1].querySelector('.device-dates'))).toBe(
        'přihlášeno 30. 10. 2026 · naposledy 04. 11. 2026 20:05',
      );
    });

    it('then this device is marked and offers no sign-out of its own, the others do', () => {
      expect(text(rows()[0].querySelector('.device-current'))).toBe('Toto zařízení');
      expect(rows()[0].querySelector('button')).toBeNull();
      expect(rows()[1].querySelector('.device-current')).toBeNull();
      expect(text(rows()[1].querySelector('button'))).toBe('Odhlásit');
      expect(rows()[1].querySelector('button')?.getAttribute('aria-label')).toBe(
        'Odhlásit iPhone · Safari',
      );
    });

    it('and the donor signs out the iPhone, then the API is told, the row disappears and the status says so', async () => {
      rows()[1].querySelector<HTMLButtonElement>('button')?.click();
      await settle();
      expect(text(rows()[1].querySelector('button'))).toBe('Odhlašujeme…');
      expect(element<HTMLButtonElement>('.devices-sign-out-others').disabled).toBe(true);
      http
        .expectOne({ method: 'DELETE', url: `${DEVICES_URL}/${IPHONE.id}` })
        .flush(null, { status: 204, statusText: 'No Content' });
      await settle();

      expect(rows().map((row) => text(row.querySelector('.device-name')))).toEqual([
        'Mac · Firefox',
        'Neznámé zařízení',
      ]);
      expect(text(element('.devices-status'))).toBe(
        'iPhone · Safari je odhlášené. Pokud jste to nebyli vy, změňte si heslo.',
      );
    });

    it('and the donor signs out every other device, then only this one stays and the status says so', async () => {
      element<HTMLButtonElement>('.devices-sign-out-others').click();
      await settle();
      expect(text(element('.devices-sign-out-others'))).toBe('Odhlašujeme…');
      http
        .expectOne({ method: 'DELETE', url: DEVICES_URL })
        .flush(null, { status: 204, statusText: 'No Content' });
      await settle();

      expect(rows()).toHaveLength(1);
      expect(element('.devices-sign-out-others')).toBeNull();
      expect(text(element('.devices-status'))).toBe('Ostatní zařízení jsou odhlášená.');
    });

    it('and signing out fails, then the reason is shown and the row stays', async () => {
      rows()[1].querySelector<HTMLButtonElement>('button')?.click();
      await settle();
      http
        .expectOne({ method: 'DELETE', url: `${DEVICES_URL}/${IPHONE.id}` })
        .flush(problem('donors/device-not-found', 'Zařízení nenalezeno'), {
          status: 404,
          statusText: 'Not Found',
        });
      await settle();

      expect(text(element('[role="alert"]'))).toContain('Zařízení nenalezeno');
      expect(rows()).toHaveLength(3);
    });
  });

  it('when only this device is signed in, then the card says no other device is and offers no sign-out', async () => {
    await listed([THIS_MAC]);

    expect(rows()).toHaveLength(1);
    expect(text(element('.devices-empty'))).toBe('Jinde přihlášení nejste.');
    expect(element('.devices-sign-out-others')).toBeNull();
  });

  it('when the list cannot be loaded, then the card shows the reason and offers to load again', async () => {
    http.expectOne(DEVICES_URL).flush(problem('x', 'Server neodpovídá'), {
      status: 500,
      statusText: 'Server Error',
    });
    await settle();

    expect(text(element('[role="alert"]'))).toContain('Server neodpovídá');

    element<HTMLButtonElement>('.devices-retry').click();
    await settle();
    await listed([THIS_MAC]);

    expect(element('[role="alert"]')).toBeNull();
    expect(rows()).toHaveLength(1);
  });

  it('when this device was signed out elsewhere, then the details page is told to send the donor to sign in', async () => {
    http.expectOne(DEVICES_URL).flush(problem('auth/session-ended', 'Odhlášeno'), {
      status: 401,
      statusText: 'Unauthorized',
    });
    http
      .expectOne('/api/donors/auth/refresh')
      .flush(problem('auth/invalid-refresh-token', 'Neplatné'), {
        status: 401,
        statusText: 'Unauthorized',
      });
    await settle();

    expect(sessionEnded).toBe(1);
  });
});
