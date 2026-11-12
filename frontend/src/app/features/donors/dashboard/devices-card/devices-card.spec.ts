import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { authInterceptor } from '../../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../../core/auth/auth-store';
import { Donor, SignedInDevice } from '../../../../core/auth/donor';
import { authResponse, problem, sampleDonor } from '../../../../core/auth/testing/donor-fixtures';
import { DevicesCard } from './devices-card';

const DEVICES_URL = '/api/donors/me/devices';
const THIS_MAC: SignedInDevice = {
  id: '019a5a3c-0000-7000-8000-000000000001',
  platform: 'MAC',
  browser: 'FIREFOX',
  session: 'REMEMBERED',
  signedInAt: '2026-11-01T07:00:00Z',
  lastUsedAt: '2026-11-05T09:30:00Z',
  current: true,
};
const IPHONE: SignedInDevice = {
  id: '019a5a3c-0000-7000-8000-000000000002',
  platform: 'IPHONE',
  browser: 'SAFARI',
  session: 'REMEMBERED',
  signedInAt: '2026-10-30T18:00:00Z',
  lastUsedAt: '2026-11-04T19:05:00Z',
  current: false,
};
const UNKNOWN: SignedInDevice = {
  id: '019a5a3c-0000-7000-8000-000000000003',
  platform: 'OTHER',
  browser: 'OTHER',
  session: 'BROWSER',
  signedInAt: '2026-10-29T10:00:00Z',
  lastUsedAt: '2026-10-29T10:00:00Z',
  current: false,
};
const OLD_IPAD: SignedInDevice = {
  id: '019a5a3c-0000-7000-8000-000000000004',
  platform: 'IPAD',
  browser: 'SAFARI',
  session: 'APP',
  signedInAt: '2026-08-01T10:00:00Z',
  lastUsedAt: '2026-09-20T10:00:00Z',
  current: false,
};
const OLD_WINDOWS: SignedInDevice = {
  id: '019a5a3c-0000-7000-8000-000000000005',
  platform: 'WINDOWS',
  browser: 'EDGE',
  session: 'PUBLIC',
  signedInAt: '2026-08-01T10:00:00Z',
  lastUsedAt: '2026-08-01T10:30:00Z',
  current: false,
};

describe("Given a donor's signed-in devices card", () => {
  let fixture: ComponentFixture<DevicesCard>;
  let http: HttpTestingController;
  let sessionEnded: number;

  async function signIn(roles: string[] = ['DONOR']): Promise<void> {
    TestBed.inject(AuthStore).login('jana@example.cz', 'correct horse battery').subscribe();
    http
      .expectOne('/api/donors/auth/login')
      .flush(authResponse('token-1', sampleDonor({ roles } as Partial<Donor>)));
    fixture = TestBed.createComponent(DevicesCard);
    document.body.appendChild(fixture.nativeElement);
    sessionEnded = 0;
    fixture.componentInstance.sessionEnded.subscribe(() => sessionEnded++);
    await settle();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DevicesCard],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    fixture?.nativeElement.remove();
    http.verify();
  });

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

  it('when the list is loading, then the card says so under its own heading and names browsers and apps', async () => {
    await signIn();
    expect(text(element('h2'))).toBe('Přihlášená zařízení');
    expect(text(element('.devices-intro'))).toBe(
      'Prohlížeče a aplikace, ve kterých jste přihlášeni. Zařízení, které neznáte, odhlaste a změňte si heslo.',
    );
    expect(text(element('[role="status"]'))).toContain('Načítáme přihlášená zařízení');
    http.expectOne(DEVICES_URL).flush({ items: [THIS_MAC] });
  });

  describe('when three devices are signed in', () => {
    beforeEach(async () => {
      await signIn();
      await listed([THIS_MAC, IPHONE, UNKNOWN]);
    });

    it('then each row names the device, the browser, the kind of sign-in and the times in Prague', () => {
      expect(rows().map((row) => text(row.querySelector('.device-name')))).toEqual([
        'Mac · Firefox',
        'iPhone · Safari',
        'Neznámé zařízení',
      ]);
      expect(text(rows()[1].querySelector('.device-last-use'))).toBe(
        'naposledy použito 4. 11. 2026 20:05',
      );
      expect(rows().map((row) => text(row.querySelector('.device-sign-in')))).toEqual([
        'přihlášeno 1. 11. 2026 · zapamatované přihlášení',
        'přihlášeno 30. 10. 2026 · zapamatované přihlášení',
        'přihlášeno 29. 10. 2026 · do zavření prohlížeče',
      ]);
    });

    it('then no row of older sign-ins is offered', () => {
      expect(element('.devices-older-toggle')).toBeNull();
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

    it('and the donor signs out the iPhone, then the API is told, the row disappears, the status says so and focus moves to the next sign-out', async () => {
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
        'Zařízení jsme odhlásili: iPhone · Safari. Pokud jste se na něm nepřihlásili vy, změňte si heslo.',
      );
      expect(document.activeElement).toBe(rows()[1].querySelector('button'));
    });

    it('and the donor signs out the last row while another device stays, then focus moves to the button that signs out every other device', async () => {
      rows()[2].querySelector<HTMLButtonElement>('button')?.click();
      await settle();
      http
        .expectOne({ method: 'DELETE', url: `${DEVICES_URL}/${UNKNOWN.id}` })
        .flush(null, { status: 204, statusText: 'No Content' });
      await settle();

      expect(rows()).toHaveLength(2);
      expect(document.activeElement).toBe(element('.devices-sign-out-others'));
    });

    it('and the donor signs out every other device, then only this one stays, the status says so and focus moves to the heading', async () => {
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
      expect(document.activeElement).toBe(element('h2'));
    });

    it('and signing out fails, then the reason is shown, the row stays and focus is back on its button', async () => {
      const button = rows()[1].querySelector<HTMLButtonElement>('button');
      button?.focus();
      button?.click();
      await settle();
      element<HTMLElement>('h2')?.focus();
      http
        .expectOne({ method: 'DELETE', url: `${DEVICES_URL}/${IPHONE.id}` })
        .flush(problem('x', 'Server neodpovídá'), { status: 500, statusText: 'Server Error' });
      await settle();

      expect(text(element('[role="alert"]'))).toContain('Server neodpovídá');
      expect(rows()).toHaveLength(3);
      expect(document.activeElement).toBe(rows()[1].querySelector('button'));
    });

    it('and signing out every other device fails, then the reason is shown, every row stays and focus is back on the button', async () => {
      const others = element<HTMLButtonElement>('.devices-sign-out-others');
      others?.focus();
      others?.click();
      await settle();
      element<HTMLElement>('h2')?.focus();
      http
        .expectOne({ method: 'DELETE', url: DEVICES_URL })
        .flush(problem('x', 'Server neodpovídá'), { status: 500, statusText: 'Server Error' });
      await settle();

      expect(text(element('[role="alert"]'))).toContain('Server neodpovídá');
      expect(rows()).toHaveLength(3);
      expect(document.activeElement).toBe(element('.devices-sign-out-others'));
    });

    it('and the iPhone was already signed out elsewhere, then its row goes with the usual status and no alert', async () => {
      rows()[1].querySelector<HTMLButtonElement>('button')?.click();
      await settle();
      http
        .expectOne({ method: 'DELETE', url: `${DEVICES_URL}/${IPHONE.id}` })
        .flush(problem('donors/device-not-found', 'Zařízení nenalezeno'), {
          status: 404,
          statusText: 'Not Found',
        });
      await settle();

      expect(element('[role="alert"]')).toBeNull();
      expect(rows()).toHaveLength(2);
      expect(text(element('.devices-status'))).toContain(
        'Zařízení jsme odhlásili: iPhone · Safari.',
      );
    });
  });

  describe('when an administrator has this device and the iPhone signed in', () => {
    beforeEach(async () => {
      await signIn(['DONOR', 'ADMIN']);
      await listed([THIS_MAC, IPHONE]);
    });

    it('and signs out the iPhone, the last other one, then focus moves to the heading', async () => {
      rows()[1].querySelector<HTMLButtonElement>('button')?.click();
      await settle();
      http
        .expectOne({ method: 'DELETE', url: `${DEVICES_URL}/${IPHONE.id}` })
        .flush(null, { status: 204, statusText: 'No Content' });
      await settle();

      expect(document.activeElement).toBe(element('h2'));
    });

    it('and signs out every other device, then the status says the connected applications stay connected', async () => {
      element<HTMLButtonElement>('.devices-sign-out-others').click();
      await settle();
      http
        .expectOne({ method: 'DELETE', url: DEVICES_URL })
        .flush(null, { status: 204, statusText: 'No Content' });
      await settle();

      expect(text(element('.devices-status'))).toBe(
        'Ostatní zařízení jsou odhlášená. Připojené aplikace zůstávají připojené; odpojíte je na kartě Připojené aplikace.',
      );
    });
  });

  it('when the iPhone is the installed app, then its row says app instead of the browser and its sign-out names it so', async () => {
    await signIn();
    await listed([THIS_MAC, { ...IPHONE, session: 'APP' }]);

    expect(text(rows()[1].querySelector('.device-name'))).toBe('iPhone · aplikace');
    expect(text(rows()[1].querySelector('.device-sign-in'))).toBe('přihlášeno 30. 10. 2026');
    expect(rows()[1].querySelector('button')?.getAttribute('aria-label')).toBe(
      'Odhlásit iPhone · aplikace',
    );
  });

  describe('when two devices were last used more than 30 days ago', () => {
    beforeEach(async () => {
      await signIn();
      await listed([THIS_MAC, IPHONE, OLD_IPAD, OLD_WINDOWS]);
    });

    const toggle = () => element<HTMLButtonElement>('.devices-older-toggle');

    it('then they are folded under a collapsed row that counts them', () => {
      expect(rows().map((row) => text(row.querySelector('.device-name')))).toEqual([
        'Mac · Firefox',
        'iPhone · Safari',
      ]);
      expect(text(toggle().querySelector('.ui-list__title'))).toBe('Starší (2)');
      expect(text(toggle().querySelector('.ui-list__meta'))).toBe('Nepoužitá déle než 30 dní');
      expect(toggle().getAttribute('aria-expanded')).toBe('false');
      expect(toggle().hasAttribute('aria-controls')).toBe(false);
    });

    it('and the donor opens the row, then the older ones show below it, newest first, and the row says it is expanded', async () => {
      toggle().click();
      await settle();

      expect(toggle().getAttribute('aria-expanded')).toBe('true');
      const older = root().querySelector(`#${toggle().getAttribute('aria-controls')}`);
      expect(
        Array.from(older?.querySelectorAll('.device-name') ?? []).map((name) => text(name)),
      ).toEqual(['iPad · aplikace', 'Windows · Edge']);
      expect(text(older?.querySelector('.device-kind') ?? null)).toBe('cizí počítač');
      expect(rows()).toHaveLength(4);

      toggle().click();
      await settle();

      expect(toggle().getAttribute('aria-expanded')).toBe('false');
      expect(rows()).toHaveLength(2);
    });

    it('and the donor signs out an older one, then focus moves to the next older sign-out', async () => {
      toggle().click();
      await settle();
      rows()[2].querySelector<HTMLButtonElement>('button')?.click();
      await settle();
      http
        .expectOne({ method: 'DELETE', url: `${DEVICES_URL}/${OLD_IPAD.id}` })
        .flush(null, { status: 204, statusText: 'No Content' });
      await settle();

      expect(text(toggle().querySelector('.ui-list__title'))).toBe('Starší (1)');
      expect(document.activeElement).toBe(rows()[2].querySelector('button'));
    });

    it('and the donor signs out the last recent one while the older ones stay folded, then focus moves to the row that opens them', async () => {
      rows()[1].querySelector<HTMLButtonElement>('button')?.click();
      await settle();
      http
        .expectOne({ method: 'DELETE', url: `${DEVICES_URL}/${IPHONE.id}` })
        .flush(null, { status: 204, statusText: 'No Content' });
      await settle();

      expect(document.activeElement).toBe(toggle());
    });

    it('and the donor signs out every other device, then the older ones go too', async () => {
      element<HTMLButtonElement>('.devices-sign-out-others').click();
      await settle();
      http
        .expectOne({ method: 'DELETE', url: DEVICES_URL })
        .flush(null, { status: 204, statusText: 'No Content' });
      await settle();

      expect(rows()).toHaveLength(1);
      expect(toggle()).toBeNull();
    });
  });

  it('when only this device is signed in, then the card says no other device is and offers no sign-out', async () => {
    await signIn();
    await listed([THIS_MAC]);

    expect(rows()).toHaveLength(1);
    expect(text(element('.devices-empty'))).toBe('Jinde přihlášení nejste.');
    expect(element('.devices-sign-out-others')).toBeNull();
  });

  it('when the list cannot be loaded, then the card shows the reason and offers to load again', async () => {
    await signIn();
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

  describe('when the card was shown once and is opened again', () => {
    beforeEach(async () => {
      await signIn();
      await listed([THIS_MAC, IPHONE]);
      fixture.destroy();
      fixture = TestBed.createComponent(DevicesCard);
      fixture.detectChanges();
    });

    it('then the devices show at once, without the loading line, and are refreshed behind them', async () => {
      expect(text(root())).not.toContain('Načítáme');
      expect(rows()).toHaveLength(2);

      await listed([THIS_MAC]);

      expect(rows()).toHaveLength(1);
    });

    it('then a device signed out before leaving does not come back for a moment', async () => {
      http.expectOne(DEVICES_URL).flush({ items: [THIS_MAC, IPHONE] });
      await settle();
      rows()[1].querySelector<HTMLButtonElement>('button')?.click();
      await settle();
      http
        .expectOne({ method: 'DELETE', url: `${DEVICES_URL}/${IPHONE.id}` })
        .flush(null, { status: 204, statusText: 'No Content' });
      await settle();
      fixture.destroy();
      fixture = TestBed.createComponent(DevicesCard);
      fixture.detectChanges();

      expect(rows()).toHaveLength(1);
      http.expectOne(DEVICES_URL).flush({ items: [THIS_MAC] });
    });
  });

  it('when this device was signed out elsewhere, then the details page is told to send the donor to sign in', async () => {
    await signIn();
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
