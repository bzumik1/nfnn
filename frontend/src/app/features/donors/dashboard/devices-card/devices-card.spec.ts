import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { authInterceptor } from '../../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../../core/auth/auth-store';
import { Donor, SignedInDevice } from '../../../../core/auth/donor';
import { authResponse, problem, sampleDonor } from '../../../../core/auth/testing/donor-fixtures';
import { DonorNotifiedDevices } from '../../../operations/donor-notified-devices';
import { accessibleText } from '../../../../shared/ui/busy-label/testing/accessible-text';
import { deviceNameInSentence } from './device-labels';
import { DevicesCard } from './devices-card';
import { withOrdinarySpaces } from '../../../../../testing/ordinary-spaces';

function expectLockedInPlace(button: HTMLButtonElement): void {
  expect(button.disabled).toBe(false);
  expect(button.getAttribute('aria-disabled')).toBe('true');
}

function announcers(element: Element): Element[] {
  return [element, ...Array.from(element.querySelectorAll('*'))].filter(
    (node) =>
      node.hasAttribute('aria-live') ||
      ['status', 'alert', 'log'].includes(node.getAttribute('role') ?? ''),
  );
}

const DEVICES_URL = '/api/donors/me/devices';
const RETURNING_SLOT = 'device-sign-out-slot--returning';
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
    return (withOrdinarySpaces(node?.textContent) ?? '').replace(/\s+/g, ' ').trim();
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

  function signOutButton(row: HTMLElement): HTMLButtonElement | null {
    return row.querySelector<HTMLButtonElement>('.device-sign-out');
  }

  async function ask(button: HTMLButtonElement | null): Promise<void> {
    button?.focus();
    button?.click();
    await settle();
  }

  async function confirmSignOut(): Promise<void> {
    element<HTMLButtonElement>('.devices-confirm-yes').click();
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

    it('then the dot before the kind of sign-in is bound to the date before it, so a wrapped line never starts with it', () => {
      expect(withOrdinarySpaces(rows()[0].querySelector('.device-sign-in')?.textContent)).toMatch(
        /2026 · zapamatované přihlášení/,
      );
    });

    it('then the devices that get push notifications say so in words, and the others say nothing of it', async () => {
      TestBed.inject(DonorNotifiedDevices).accept([IPHONE.id]);
      await settle();

      expect(rows().map((row) => text(row.querySelector('.device-notified')))).toEqual([
        '',
        'dostává upozornění',
        '',
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

    it('and the donor presses Odhlásit at the iPhone, then the card asks first, tells the API nothing yet and moves focus into the question', async () => {
      await ask(signOutButton(rows()[1]));

      const confirmation = rows()[1].querySelector<HTMLElement>('.devices-confirm');
      expect(confirmation?.getAttribute('role')).toBe('group');
      const question = document.getElementById(confirmation?.getAttribute('aria-labelledby') ?? '');
      expect(text(question)).toBe('Odhlásit iPhone · Safari?');
      expect(accessibleText(element('.devices-confirm-yes'))).toBe('Odhlásit');
      expect(element('.devices-confirm-yes').classList).toContain('ui-button--danger');
      expect(text(element('.devices-confirm-no'))).toBe('Zrušit');
      const foldedSlot = rows()[1].querySelector('.device-sign-out-slot');
      expect(foldedSlot?.hasAttribute('inert')).toBe(true);
      expect(foldedSlot?.getAttribute('aria-hidden')).toBe('true');
      expect(document.activeElement).toBe(element('.devices-confirm-no'));
      http.expectNone({ method: 'DELETE' });
    });

    it('and the donor presses Odhlásit at the unknown device, then its name reads in lower case inside the button’s name and the question', async () => {
      expect(rows()[2].querySelector('button')?.getAttribute('aria-label')).toBe(
        'Odhlásit neznámé zařízení',
      );

      await ask(signOutButton(rows()[2]));

      const confirmation = rows()[2].querySelector<HTMLElement>('.devices-confirm');
      const question = document.getElementById(confirmation?.getAttribute('aria-labelledby') ?? '');
      expect(text(question)).toBe('Odhlásit neznámé zařízení?');
      expect(text(rows()[2].querySelector('.device-name'))).toBe('Neznámé zařízení');
    });

    it('and the donor cancels the question, then nothing is signed out and focus is back on the iPhone’s Odhlásit', async () => {
      await ask(signOutButton(rows()[1]));
      element<HTMLButtonElement>('.devices-confirm-no').click();
      await settle();

      expect(element('.devices-confirm')).toBeNull();
      expect(rows()).toHaveLength(3);
      expect(document.activeElement).toBe(signOutButton(rows()[1]));
      http.expectNone({ method: 'DELETE' });
    });

    it('and the donor cancels the question, then only the iPhone’s Odhlásit unfolds back, while the list drew every Odhlásit unfolded', async () => {
      const returning = () =>
        rows().map((row) =>
          row.querySelector('.device-sign-out-slot')?.classList.contains(RETURNING_SLOT),
        );
      expect(returning()).toEqual([undefined, false, false]);

      await ask(signOutButton(rows()[1]));
      element<HTMLButtonElement>('.devices-confirm-no').click();
      await settle();

      expect(returning()).toEqual([undefined, true, false]);
    });

    it('and the donor signs out the iPhone, then the API is told, the row disappears, the status says so and the device below takes focus', async () => {
      await ask(signOutButton(rows()[1]));
      await confirmSignOut();
      expect(accessibleText(element('.devices-confirm-yes'))).toBe('Odhlásit');
      expect(element('.devices-confirm-yes').getAttribute('aria-busy')).toBe('true');
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
      expect(element('.devices-confirm')).toBeNull();
      expect(document.activeElement).toBe(signOutButton(rows()[1]));
      expect(text(rows()[1].querySelector('.device-name'))).toBe('Neznámé zařízení');
    });

    it('and the donor signs out the last device of the list, then the device above takes focus', async () => {
      await ask(signOutButton(rows()[2]));
      await confirmSignOut();
      http
        .expectOne({ method: 'DELETE', url: `${DEVICES_URL}/${UNKNOWN.id}` })
        .flush(null, { status: 204, statusText: 'No Content' });
      await settle();

      expect(rows()).toHaveLength(2);
      expect(document.activeElement).toBe(signOutButton(rows()[1]));
      expect(text(rows()[1].querySelector('.device-name'))).toBe('iPhone · Safari');
    });

    it('and the donor signs out the unknown device, then the status names it in lower case inside its sentence', async () => {
      await ask(signOutButton(rows()[2]));
      await confirmSignOut();
      http
        .expectOne({ method: 'DELETE', url: `${DEVICES_URL}/${UNKNOWN.id}` })
        .flush(null, { status: 204, statusText: 'No Content' });
      await settle();

      expect(text(element('.devices-status'))).toBe(
        'Zařízení jsme odhlásili: neznámé zařízení. Pokud jste se na něm nepřihlásili vy, změňte si heslo.',
      );
    });

    it('and the donor asks to sign out the iPhone or every other device, then both questions use the shared in-card confirmation', async () => {
      const expectShared = (confirmation: HTMLElement | null) => {
        expect(confirmation?.classList).toContain('ui-confirm');
        expect(confirmation?.querySelector('.devices-confirm-text')?.classList).toContain(
          'ui-confirm__text',
        );
        expect(confirmation?.querySelector('.devices-confirm-actions')?.classList).toContain(
          'ui-confirm__actions',
        );
        expect(confirmation?.querySelector('.devices-confirm-no')?.classList).toContain(
          'ui-button--quiet',
        );
      };

      await ask(signOutButton(rows()[1]));
      expectShared(rows()[1].querySelector<HTMLElement>('.devices-confirm-box'));

      element<HTMLButtonElement>('.devices-confirm-no').click();
      await settle();
      await ask(element<HTMLButtonElement>('.devices-sign-out-others'));
      expectShared(element<HTMLElement>('.devices-footer .devices-confirm-box'));
    });

    it("and the donor signs out the iPhone, then the card's status line, never the button, says first that it signs out and then only the result", async () => {
      const status = element('.devices-status');
      expect(status.getAttribute('role')).toBe('status');
      await ask(signOutButton(rows()[1]));
      await confirmSignOut();

      const yes = element<HTMLButtonElement>('.devices-confirm-yes');
      expect(announcers(yes)).toEqual([]);
      expect(element('.devices-status')).toBe(status);
      expect(text(status)).toBe('Odhlašujeme…');
      expect(
        withOrdinarySpaces(status.querySelector('.visually-hidden')?.textContent)?.trim(),
      ).toBe('Odhlašujeme…');
      http
        .expectOne({ method: 'DELETE', url: `${DEVICES_URL}/${IPHONE.id}` })
        .flush(null, { status: 204, statusText: 'No Content' });
      await settle();

      expect(element('.devices-status')).toBe(status);
      expect(text(status)).toBe(
        'Zařízení jsme odhlásili: iPhone · Safari. Pokud jste se na něm nepřihlásili vy, změňte si heslo.',
      );
    });

    it('and the donor signs out the iPhone, then its button is locked at once and keeps both labels, so its width does not change', async () => {
      await ask(signOutButton(rows()[1]));
      await confirmSignOut();

      const yes = element<HTMLButtonElement>('.devices-confirm-yes');
      expectLockedInPlace(yes);
      expect(
        Array.from(yes.querySelectorAll('.busy-label__face')).map((face) => text(face)),
      ).toEqual(['Odhlásit', 'Odhlašujeme…']);
      http
        .expectOne({ method: 'DELETE', url: `${DEVICES_URL}/${IPHONE.id}` })
        .flush(null, { status: 204, statusText: 'No Content' });
      await settle();
    });

    it('and the donor presses the focused Odhlásit again while the iPhone signs out, then nothing more is sent and the focus stays on it', async () => {
      await ask(signOutButton(rows()[1]));
      const yes = element<HTMLButtonElement>('.devices-confirm-yes');
      yes.focus();
      await confirmSignOut();

      yes.click();
      await settle();

      expect(document.activeElement).toBe(yes);
      http
        .expectOne({ method: 'DELETE', url: `${DEVICES_URL}/${IPHONE.id}` })
        .flush(null, { status: 204, statusText: 'No Content' });
      await settle();
    });

    it('and the donor signs out every other device, then the button is locked at once and keeps both labels', async () => {
      await ask(element<HTMLButtonElement>('.devices-sign-out-others'));
      await confirmSignOut();

      const yes = element<HTMLButtonElement>('.devices-confirm-yes');
      expectLockedInPlace(yes);
      expect(
        Array.from(yes.querySelectorAll('.busy-label__face')).map((face) => text(face)),
      ).toEqual(['Odhlásit', 'Odhlašujeme…']);
      http
        .expectOne({ method: 'DELETE', url: DEVICES_URL })
        .flush(null, { status: 204, statusText: 'No Content' });
      await settle();
    });

    it('and the donor presses Odhlásit všechna ostatní zařízení, then the card asks the same way and cancelling returns focus to that button', async () => {
      await ask(element<HTMLButtonElement>('.devices-sign-out-others'));

      const confirmation = element<HTMLElement>('.devices-footer .devices-confirm');
      const question = document.getElementById(confirmation?.getAttribute('aria-labelledby') ?? '');
      expect(text(question)).toBe('Odhlásit všechna ostatní zařízení?');
      expect(accessibleText(element('.devices-confirm-yes'))).toBe('Odhlásit');
      expect(document.activeElement).toBe(element('.devices-confirm-no'));
      http.expectNone({ method: 'DELETE' });

      element<HTMLButtonElement>('.devices-confirm-no').click();
      await settle();

      expect(element('.devices-confirm')).toBeNull();
      expect(document.activeElement).toBe(element('.devices-sign-out-others'));
    });

    it('and the donor signs out every other device, then only this one stays, the status says so and the heading takes focus', async () => {
      await ask(element<HTMLButtonElement>('.devices-sign-out-others'));
      await confirmSignOut();
      expect(accessibleText(element('.devices-confirm-yes'))).toBe('Odhlásit');
      expect(element('.devices-confirm-yes').getAttribute('aria-busy')).toBe('true');
      http
        .expectOne({ method: 'DELETE', url: DEVICES_URL })
        .flush(null, { status: 204, statusText: 'No Content' });
      await settle();

      expect(rows()).toHaveLength(1);
      expect(element('.devices-sign-out-others')).toBeNull();
      expect(text(element('.devices-status'))).toBe('Ostatní zařízení jsou odhlášená.');
      expect(document.activeElement).toBe(element('#devices-title'));
    });

    it('and signing out fails, then the reason is shown, the row stays and focus is back on its button', async () => {
      await ask(signOutButton(rows()[1]));
      await confirmSignOut();
      element<HTMLElement>('h2')?.focus();
      http
        .expectOne({ method: 'DELETE', url: `${DEVICES_URL}/${IPHONE.id}` })
        .flush(problem('x', 'Server neodpovídá'), { status: 500, statusText: 'Server Error' });
      await settle();

      expect(text(element('[role="alert"]'))).toContain('Server neodpovídá');
      expect(rows()).toHaveLength(3);
      expect(element('.devices-confirm')).toBeNull();
      expect(document.activeElement).toBe(signOutButton(rows()[1]));
    });

    it('and signing out every other device fails, then the reason is shown, every row stays and focus is back on the button', async () => {
      await ask(element<HTMLButtonElement>('.devices-sign-out-others'));
      await confirmSignOut();
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
      await ask(signOutButton(rows()[1]));
      await confirmSignOut();
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

    it('and signs out every other device, then the status says the connected applications stay connected', async () => {
      await ask(element<HTMLButtonElement>('.devices-sign-out-others'));
      await confirmSignOut();
      http
        .expectOne({ method: 'DELETE', url: DEVICES_URL })
        .flush(null, { status: 204, statusText: 'No Content' });
      await settle();

      expect(text(element('.devices-status'))).toBe(
        'Ostatní zařízení jsou odhlášená. Připojené aplikace zůstávají připojené; odpojíte je v kartě „Připojené aplikace“.',
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

    it('and the donor signs out an older one, then the row that opens them counts one less and the older one below takes focus', async () => {
      toggle().click();
      await settle();
      await ask(signOutButton(rows()[2]));
      await confirmSignOut();
      http
        .expectOne({ method: 'DELETE', url: `${DEVICES_URL}/${OLD_IPAD.id}` })
        .flush(null, { status: 204, statusText: 'No Content' });
      await settle();

      expect(text(toggle().querySelector('.ui-list__title'))).toBe('Starší (1)');
      expect(document.activeElement).toBe(signOutButton(rows()[2]));
      expect(text(rows()[2].querySelector('.device-name'))).toBe('Windows · Edge');
    });

    it('and the donor signs out every other device, then the older ones go too', async () => {
      await ask(element<HTMLButtonElement>('.devices-sign-out-others'));
      await confirmSignOut();
      http
        .expectOne({ method: 'DELETE', url: DEVICES_URL })
        .flush(null, { status: 204, statusText: 'No Content' });
      await settle();

      expect(rows()).toHaveLength(1);
      expect(toggle()).toBeNull();
    });
  });

  describe('when the signed-out row takes a while to leave', () => {
    let scrolled: { element: HTMLElement; options: unknown }[];
    const realMatchMedia = window.matchMedia;

    function deviceAsksForLessMotion(less: boolean): void {
      window.matchMedia = ((query: string) => ({
        matches: less && query === '(prefers-reduced-motion: reduce)',
        media: query,
      })) as typeof window.matchMedia;
    }

    function slowToLeave(device: SignedInDevice): () => Promise<void> {
      let finish: () => void = () => undefined;
      const finished = new Promise<void>((resolve) => (finish = resolve));
      document.getElementById(`device-row-${device.id}`)!.getAnimations = () =>
        [
          {
            effect: { getComputedTiming: () => ({ endTime: 300 }) },
            playState: 'running',
            finished,
          },
        ] as never;
      return async () => {
        finish();
        await settle();
        await new Promise((done) => requestAnimationFrame(() => done(undefined)));
      };
    }

    async function signOutUnknown(): Promise<void> {
      await ask(signOutButton(rows()[2]));
      await confirmSignOut();
      http
        .expectOne({ method: 'DELETE', url: `${DEVICES_URL}/${UNKNOWN.id}` })
        .flush(null, { status: 204, statusText: 'No Content' });
      await settle();
    }

    beforeEach(async () => {
      scrolled = [];
      HTMLElement.prototype.scrollIntoView = function (this: HTMLElement, options?: unknown) {
        scrolled.push({ element: this, options });
      };
      await signIn();
      await listed([THIS_MAC, IPHONE, UNKNOWN, OLD_IPAD, OLD_WINDOWS]);
    });

    afterEach(() => {
      Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
      window.matchMedia = realMatchMedia;
    });

    it('and the device asks for no less motion, then the control that took the focus glides into view once the row has left', async () => {
      deviceAsksForLessMotion(false);
      const leave = slowToLeave(UNKNOWN);
      await signOutUnknown();
      const focused = document.activeElement;

      expect(focused).toBe(element('.devices-older-toggle'));
      expect(scrolled).toEqual([]);

      await leave();

      expect(scrolled).toEqual([
        { element: focused, options: { block: 'nearest', behavior: 'smooth' } },
      ]);
    });

    it('and the device asks for less motion, then the control that took the focus jumps into view once the row has left', async () => {
      deviceAsksForLessMotion(true);
      const leave = slowToLeave(UNKNOWN);
      await signOutUnknown();
      const focused = document.activeElement;

      await leave();

      expect(scrolled).toEqual([
        { element: focused, options: { block: 'nearest', behavior: 'instant' } },
      ]);
    });

    it('and the donor moves the focus elsewhere before the row has left, then nothing scrolls', async () => {
      const leave = slowToLeave(UNKNOWN);
      await signOutUnknown();
      element<HTMLButtonElement>('.devices-sign-out-others').focus();

      await leave();

      expect(scrolled).toEqual([]);
    });

    it('and another row leaves through a quiet refresh meanwhile, then nothing scrolls', async () => {
      const leaveUnknown = slowToLeave(UNKNOWN);
      await signOutUnknown();
      const leaveIphone = slowToLeave(IPHONE);
      fixture.componentInstance.loadDevices(false, true);
      http.expectOne(DEVICES_URL).flush({ items: [THIS_MAC, OLD_IPAD, OLD_WINDOWS] });
      await settle();

      await leaveIphone();

      expect(document.activeElement).toBe(element('.devices-older-toggle'));
      expect(scrolled).toEqual([]);
      await leaveUnknown();
    });
  });

  it('when the donor signs out the only other device, then the heading takes focus and the card says no other device is', async () => {
    await signIn();
    await listed([THIS_MAC, IPHONE]);

    await ask(signOutButton(rows()[1]));
    await confirmSignOut();
    http
      .expectOne({ method: 'DELETE', url: `${DEVICES_URL}/${IPHONE.id}` })
      .flush(null, { status: 204, statusText: 'No Content' });
    await settle();

    expect(rows()).toHaveLength(1);
    expect(text(element('.devices-empty'))).toBe('Jinde přihlášení nejste.');
    expect(document.activeElement).toBe(element('#devices-title'));
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
    expect(text(element('.devices-retry'))).toBe('Zkusit znovu');

    element<HTMLButtonElement>('.devices-retry').click();
    await settle();
    await listed([THIS_MAC]);

    expect(element('[role="alert"]')).toBeNull();
    expect(rows()).toHaveLength(1);
  });

  describe('when the card was shown once and is opened again', () => {
    async function signOut(device: SignedInDevice, status: 204 | 503): Promise<void> {
      const name = device === IPHONE ? 'iPhone · Safari' : 'Neznámé zařízení';
      const row = rows().find((each) => text(each.querySelector('.device-name')) === name);
      await ask(row ? signOutButton(row) : null);
      await confirmSignOut();
      const request = http.expectOne({ method: 'DELETE', url: `${DEVICES_URL}/${device.id}` });
      if (status === 204) {
        request.flush(null, { status: 204, statusText: 'No Content' });
      } else {
        request.flush(problem('x', 'Server neodpovídá'), {
          status: 503,
          statusText: 'Unavailable',
        });
      }
      await settle();
    }

    beforeEach(async () => {
      await signIn();
      await listed([THIS_MAC, IPHONE]);
      fixture.destroy();
      fixture = TestBed.createComponent(DevicesCard);
      sessionEnded = 0;
      fixture.componentInstance.sessionEnded.subscribe(() => sessionEnded++);
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
      await ask(signOutButton(rows()[1]));
      await confirmSignOut();
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

    it('then a device signed out while the refresh is still on its way does not come back with its answer, and the list is asked for again', async () => {
      const refresh = http.expectOne(DEVICES_URL);
      await signOut(IPHONE, 204);
      refresh.flush({ items: [THIS_MAC, IPHONE] });
      await settle();

      expect(rows()).toHaveLength(1);
      await listed([THIS_MAC]);
      expect(rows()).toHaveLength(1);
    });

    it('then a sign-out that fails while the refresh is on its way asks for the list again and shows its answer', async () => {
      const refresh = http.expectOne(DEVICES_URL);
      await signOut(IPHONE, 503);
      refresh.flush({ items: [THIS_MAC, IPHONE] });
      await settle();

      await listed([THIS_MAC, IPHONE, UNKNOWN]);

      expect(rows()).toHaveLength(3);
    });

    it('then a second sign-out while the list is asked for again after the first does not bring the second device back', async () => {
      http.expectOne(DEVICES_URL).flush({ items: [THIS_MAC, IPHONE, UNKNOWN] });
      await settle();
      fixture.destroy();
      fixture = TestBed.createComponent(DevicesCard);
      fixture.detectChanges();
      const refresh = http.expectOne(DEVICES_URL);
      await signOut(IPHONE, 204);
      refresh.flush({ items: [THIS_MAC, IPHONE, UNKNOWN] });
      await settle();
      const again = http.expectOne(DEVICES_URL);

      await signOut(UNKNOWN, 204);
      again.flush({ items: [THIS_MAC, UNKNOWN] });
      await settle();

      expect(rows()).toHaveLength(1);
      await listed([THIS_MAC]);
      expect(rows()).toHaveLength(1);
    });

    it('then a list asked for again that fails keeps the devices shown, without an error', async () => {
      const refresh = http.expectOne(DEVICES_URL);
      await signOut(IPHONE, 204);
      refresh.flush({ items: [THIS_MAC, IPHONE] });
      await settle();

      http
        .expectOne(DEVICES_URL)
        .flush(problem('x', 'Server neodpovídá'), { status: 503, statusText: 'Unavailable' });
      await settle();

      expect(rows()).toHaveLength(1);
      expect(text(root())).not.toContain('se nepodařilo načíst');

      fixture.destroy();
      fixture = TestBed.createComponent(DevicesCard);
      fixture.detectChanges();

      expect(rows()).toHaveLength(1);
      http.expectOne(DEVICES_URL).flush({ items: [THIS_MAC] });
    });

    it('then a refresh refused because the session ended still sends the donor to sign in', async () => {
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

describe('Given a device whose platform the site does not know', () => {
  it('when its name stands inside a sentence, then the fallback words are in lower case and a known browser keeps its name', () => {
    expect(deviceNameInSentence({ platform: 'OTHER', browser: 'SAFARI', session: 'BROWSER' })).toBe(
      'jiné zařízení · Safari',
    );
    expect(deviceNameInSentence({ platform: 'IPHONE', browser: 'OTHER', session: 'BROWSER' })).toBe(
      'iPhone · jiný prohlížeč',
    );
  });
});
