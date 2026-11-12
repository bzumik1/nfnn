import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal, type WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { authInterceptor } from '../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../core/auth/auth-store';
import { authResponse, sampleDonor } from '../../../core/auth/testing/donor-fixtures';
import { donorAccount } from '../testing/admin-fixtures';
import { AdminDonors } from './admin-donors';
import { CompactLayout } from '../../../core/layout/compact-layout';
import { person, PORTRAIT_ID } from '../../content/testing/people-fixtures';
import { AdministrationCopy } from '../device-copy/administration-copy';
import type { CopiedGift } from './recent-donors';

const SEARCH_URL = '/api/admin/donors';
const PEOPLE_URL = '/api/admin/content/people';

class FakeAdministrationCopy {
  readonly gifts: WritableSignal<readonly CopiedGift[] | null> = signal(null);
  readonly accounts: WritableSignal<readonly unknown[] | null> = signal(null);
  readonly summary = signal(null);
  readonly storedAt = signal(null);
  private readonly unread = signal(null);

  opened(): boolean {
    return false;
  }

  rows(part: string, kind: string) {
    if (part === 'donations' && kind === 'donations') {
      return this.gifts.asReadonly();
    }
    if (part === 'donors' && kind === 'accounts') {
      return this.accounts.asReadonly();
    }
    return this.unread.asReadonly();
  }
}

function gift(overrides: Partial<CopiedGift> = {}): CopiedGift {
  return {
    id: '0192f0f1-0000-7000-8000-000000000001',
    donorId: '01a18e56-bdb0-775a-bd0a-a60756831369',
    receivedAt: '2026-10-12',
    amountMinor: 50000,
    status: 'RECEIVED',
    purpose: 'GENERAL',
    recordedAt: '2026-10-12T09:00:00Z',
    ...overrides,
  };
}

function problem(status: number, type: string, title: string, detail: string) {
  return {
    body: { type: `https://nfnn.cz/problems/${type}`, title, detail, status },
    options: {
      status,
      statusText: 'Error',
      headers: { 'Content-Type': 'application/problem+json' },
    },
  };
}

describe('Given an administrator on the donors page', () => {
  let fixture: ComponentFixture<AdminDonors>;
  let http: HttpTestingController;
  let copy: FakeAdministrationCopy;

  const jana = donorAccount({ administrator: true, secondFactorEnabled: true });
  const stavby = donorAccount({
    donorId: '019a1c00-0000-7000-8000-00000000a003',
    type: 'COMPANY',
    name: 'Stavby Novák s.r.o.',
    companyIdentifier: '45274649',
    email: 'stavby@example.cz',
    variableSymbol: '7310945528',
    emailVerified: false,
  });

  beforeEach(async () => {
    vi.useFakeTimers();
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AdminDonors],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AdministrationCopy, useFactory: () => new FakeAdministrationCopy() },
      ],
    }).compileComponents();
    copy = TestBed.inject(AdministrationCopy) as unknown as FakeAdministrationCopy;
    http = TestBed.inject(HttpTestingController);
    const store = TestBed.inject(AuthStore);
    store.login('jana@example.cz', 'correct horse battery').subscribe();
    http
      .expectOne('/api/donors/auth/login')
      .flush(authResponse('token-1', sampleDonor({ roles: ['DONOR', 'ADMIN'] })));
    fixture = TestBed.createComponent(AdminDonors);
    fixture.detectChanges();
    http.expectOne(PEOPLE_URL).flush({ members: [person()] });
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  function text(selector: string): string {
    return (fixture.nativeElement.querySelector(selector)?.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function rows(): HTMLTableRowElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('tbody tr'));
  }

  function rowText(row: HTMLElement): string {
    return (row.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  function lastGift(row: HTMLElement): string[] {
    return Array.from(
      row.querySelectorAll('td[data-label="Poslední dar"] > span') as NodeListOf<HTMLElement>,
    ).map((part) => rowText(part));
  }

  function type(value: string): void {
    const input = fixture.nativeElement.querySelector('#donor-search') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  async function searched(value: string, items = [jana, stavby], hasMore = false): Promise<void> {
    type(value);
    await vi.advanceTimersByTimeAsync(300);
    fixture.detectChanges();
    const request = http.expectOne((candidate) => candidate.url === SEARCH_URL);
    expect(request.request.params.get('query')).toBe(value.trim());
    request.flush({ items, hasMore });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('when nothing was typed yet, then the page invites to search and asks the backend nothing', () => {
    expect(text('h1')).toBe('Dárci');
    expect(text('[role="status"]')).toBe('Začněte psát a dárci se objeví tady.');
    http.expectNone((candidate) => candidate.url === SEARCH_URL);
  });

  describe('when the copy on this device holds gifts', () => {
    const petr = donorAccount({
      donorId: '019a1c00-0000-7000-8000-00000000a002',
      name: 'Petr Svoboda',
      email: 'petr@example.cz',
      variableSymbol: '7310945528',
    });

    beforeEach(() => {
      copy.accounts.set([jana, petr, stavby]);
      copy.gifts.set([
        gift({ id: 'g1', donorId: jana.donorId, receivedAt: '2026-09-01', amountMinor: 10000 }),
        gift({ id: 'g2', donorId: petr.donorId, receivedAt: '2026-10-25', amountMinor: 123450 }),
        gift({ id: 'g3', donorId: jana.donorId, receivedAt: '2026-10-05', amountMinor: 30000 }),
      ]);
      fixture.detectChanges();
    });

    it('when nothing was typed yet, then the donors who gave last are listed newest first with their last gift, each leading to the card, and nothing is asked', () => {
      expect(text('.recent-title')).toBe('Naposledy přispěli');
      expect(text('[role="status"]')).toBe('');
      expect(
        Array.from(
          fixture.nativeElement.querySelectorAll('thead th') as NodeListOf<HTMLElement>,
        ).map((cell) => cell.textContent?.trim()),
      ).toEqual(['Dárce', 'E-mail', 'Variabilní symbol', 'Poslední dar', 'Stav účtu']);
      const [first, second] = rows();
      expect(rows()).toHaveLength(2);
      expect(rowText(first)).toContain('Petr Svoboda');
      expect(lastGift(first)).toEqual(['1 234,50 Kč', '25. 10. 2026']);
      expect(first.querySelector('a')?.getAttribute('href')).toBe(
        '/sprava/darci/019a1c00-0000-7000-8000-00000000a002',
      );
      expect(rowText(second)).toContain('Jana Nováková');
      expect(lastGift(second)).toEqual(['300 Kč', '5. 10. 2026']);
      http.expectNone((candidate) => candidate.url === SEARCH_URL);
    });

    it('when a query is typed, then the results take the place of the list, and when it is cleared, the list comes back', async () => {
      await searched('stav', [stavby]);

      expect(fixture.nativeElement.querySelector('.recent-title')).toBeNull();
      expect(rows().map((row) => row.querySelector('a')?.textContent?.trim())).toEqual([
        'Stavby Novák s.r.o.',
      ]);
      expect(rowText(rows()[0])).toContain('17. 10. 2026');

      type('');
      await vi.advanceTimersByTimeAsync(300);
      fixture.detectChanges();

      expect(text('.recent-title')).toBe('Naposledy přispěli');
      expect(rows().map((row) => row.querySelector('a')?.textContent?.trim())).toEqual([
        'Petr Svoboda',
        'Jana Nováková',
      ]);
    });
  });

  it('when the copy on this device holds no gift yet, then the page invites to search as before', () => {
    copy.accounts.set([jana]);
    copy.gifts.set([]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.recent-title')).toBeNull();
    expect(text('[role="status"]')).toBe('Začněte psát a dárci se objeví tady.');
  });

  it('when a query is typed, then after the pause the matching donors come with their e-mail, symbol, registration and account tags', async () => {
    await searched(' nov ');

    const [first, second] = rows();
    expect(rowText(first)).toContain('Jana Nováková');
    expect(rowText(first)).toContain('Osoba');
    expect(rowText(first)).toContain('jana@example.cz');
    expect(rowText(first)).toContain('4821937560');
    expect(rowText(first)).toContain('17. 10. 2026');
    expect(rowText(first)).not.toContain('10:00');
    expect(
      Array.from(fixture.nativeElement.querySelectorAll('thead th') as NodeListOf<HTMLElement>).map(
        (cell) => cell.textContent?.trim(),
      ),
    ).toEqual(['Dárce', 'E-mail', 'Variabilní symbol', 'Registrace', 'Stav účtu']);
    expect(rowText(first)).toContain('Správce');
    expect(rowText(first)).toContain('Dvoufaktorové ověření');
    expect(first.querySelector('a')?.getAttribute('href')).toBe(
      '/sprava/darci/01a18e56-bdb0-775a-bd0a-a60756831369',
    );
    expect(rowText(second)).toContain('Stavby Novák s.r.o.');
    expect(rowText(second)).toContain('Firma · IČO 45274649');
    expect(rowText(second)).toContain('E-mail neověřen');
    expect(rowText(second)).not.toContain('Správce');
    expect(text('[role="status"]')).toBe('Nalezení dárci: 2');
  });

  it('when a found donor registered on an early morning of a single-digit day and month, then the registration reads as the Prague day without leading zeros and without the time', async () => {
    await searched('nov', [donorAccount({ registeredAt: '2026-03-05T07:00:00Z' })]);

    const [row] = rows();
    expect((row.querySelector('td[data-label="Registrace"]')?.textContent ?? '').trim()).toBe(
      '5. 3. 2026',
    );
  });

  it('when a found donor was erased, then the row carries the erased tag and no other account tag', async () => {
    await searched('4821', [
      donorAccount({
        name: 'Vymazaný dárce',
        email: 'erased-01a18e56-bdb0-775a-bd0a-a60756831369@erased.invalid',
        emailVerified: false,
        erasedAt: '2026-10-23T09:00:00Z',
      }),
    ]);

    const [row] = rows();
    expect(rowText(row)).toContain('Vymazaný dárce');
    expect(rowText(row)).toContain('Údaje vymazány');
    expect(rowText(row)).not.toContain('E-mail neověřen');
    expect(rowText(row)).not.toContain('erased.invalid');
    expect(rowText(row)).toContain('vymazán');
    expect(rowText(row)).not.toContain('běžný účet');
  });

  it('when nobody matches, then the page says so', async () => {
    await searched('xyz', []);

    expect(text('[role="status"]')).toBe('Žádný dárce neodpovídá.');
    expect(rows()).toHaveLength(0);
  });

  it('when the query is cleared, then the results go and nothing is asked', async () => {
    await searched('nov');

    type('');
    await vi.advanceTimersByTimeAsync(300);
    fixture.detectChanges();

    expect(rows()).toHaveLength(0);
    expect(text('[role="status"]')).toBe('Začněte psát a dárci se objeví tady.');
    http.expectNone((candidate) => candidate.url === SEARCH_URL);
  });

  it('when typing continues within the pause, then only the final query is sent', async () => {
    type('n');
    await vi.advanceTimersByTimeAsync(100);
    type('no');
    await vi.advanceTimersByTimeAsync(100);
    type('nov');
    await vi.advanceTimersByTimeAsync(300);
    fixture.detectChanges();

    const request = http.expectOne((candidate) => candidate.url === SEARCH_URL);
    expect(request.request.params.get('query')).toBe('nov');
    request.flush({ items: [jana] });
    fixture.detectChanges();
    expect(rows()).toHaveLength(1);
  });

  it('when the search fails, then an alert says so and its retry sends the same query again', async () => {
    type('nov');
    await vi.advanceTimersByTimeAsync(300);
    fixture.detectChanges();
    http
      .expectOne((candidate) => candidate.url === SEARCH_URL)
      .flush(null, { status: 500, statusText: 'Error' });
    fixture.detectChanges();

    expect(text('[role="alert"] p')).toBe('Hledání se nepodařilo. Zkuste to prosím znovu.');
    (fixture.nativeElement.querySelector('[role="alert"] button') as HTMLButtonElement).click();
    fixture.detectChanges();
    const again = http.expectOne((candidate) => candidate.url === SEARCH_URL);
    expect(again.request.params.get('query')).toBe('nov');
    again.flush({ items: [jana], hasMore: false });
    fixture.detectChanges();

    expect(rows()).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });

  it('when more donors match than the page shows, then the page says only the first ones are shown', async () => {
    await searched('a', [jana, stavby], true);

    expect(text('[role="status"]')).toBe(
      'Zobrazujeme prvních 2 dárců. Upřesněte hledání, ať najdete toho správného.',
    );
  });

  it('when the role was taken away meanwhile, then the page goes to the overview', async () => {
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const refusal = problem(403, 'auth/forbidden', 'Nemáte oprávnění', 'Jen pro správce.');

    type('nov');
    await vi.advanceTimersByTimeAsync(300);
    fixture.detectChanges();
    http
      .expectOne((candidate) => candidate.url === SEARCH_URL)
      .flush(refusal.body, refusal.options);
    fixture.detectChanges();

    expect(navigate).toHaveBeenCalledWith('/darce/prehled');
  });
});

describe('Given an administrator on the donors page where lists show as rows', () => {
  let fixture: ComponentFixture<AdminDonors>;
  let http: HttpTestingController;
  let copy: FakeAdministrationCopy;

  beforeEach(async () => {
    vi.useFakeTimers();
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AdminDonors],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AdministrationCopy, useFactory: () => new FakeAdministrationCopy() },
        {
          provide: CompactLayout,
          useValue: {
            isCompact: signal(true).asReadonly(),
            listsAsRows: signal(true).asReadonly(),
          },
        },
      ],
    }).compileComponents();
    copy = TestBed.inject(AdministrationCopy) as unknown as FakeAdministrationCopy;
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthStore).login('jana@example.cz', 'correct horse battery').subscribe();
    http
      .expectOne('/api/donors/auth/login')
      .flush(authResponse('token-1', sampleDonor({ roles: ['DONOR', 'ADMIN'] })));
    fixture = TestBed.createComponent(AdminDonors);
    fixture.detectChanges();
    http.expectOne(PEOPLE_URL).flush({ members: [person()] });
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  function spaced(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent ?? '';
    }
    if (node instanceof Element && node.getAttribute('aria-hidden') === 'true') {
      return '';
    }
    return Array.from(node.childNodes).map(spaced).join(' ');
  }

  function rowText(row: Element): string {
    return spaced(row).replace(/\s+/g, ' ').trim();
  }

  it('when nothing was typed yet and the copy holds gifts, then each donor who gave last is one row with the last gift beside the name', () => {
    copy.accounts.set([donorAccount()]);
    copy.gifts.set([gift({ amountMinor: 50000, receivedAt: '2026-10-12' })]);
    fixture.detectChanges();

    const rows = Array.from(
      fixture.nativeElement.querySelectorAll(
        '.donor-rows a.ui-list__row',
      ) as NodeListOf<HTMLElement>,
    );
    expect(rows.map(rowText)).toEqual([
      'Jana Nováková VS 4821937560 · jana@example.cz 500 Kč 12. 10. 2026',
    ]);
    expect(rows[0].querySelector('app-avatar')).not.toBeNull();
  });

  it('when donors are found, then each is one row leading to the card, with the symbol and e-mail under the name and only the tags that say something', async () => {
    const input = fixture.nativeElement.querySelector('#donor-search') as HTMLInputElement;
    input.value = 'nov';
    input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(300);
    http
      .expectOne((candidate) => candidate.url === SEARCH_URL)
      .flush({
        items: [
          donorAccount(),
          donorAccount({
            donorId: '019a1c00-0000-7000-8000-00000000a003',
            type: 'COMPANY',
            name: 'Stavby Novák s.r.o.',
            companyIdentifier: '45274649',
            email: 'stavby@example.cz',
            variableSymbol: '7310945528',
            administrator: true,
          }),
        ],
        hasMore: false,
      });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('table')).toBeNull();
    const rows = Array.from(
      fixture.nativeElement.querySelectorAll(
        '.donor-rows a.ui-list__row',
      ) as NodeListOf<HTMLElement>,
    );
    expect(rows.map(rowText)).toEqual([
      'Jana Nováková VS 4821937560 · jana@example.cz',
      'Stavby Novák s.r.o. VS 7310945528 · stavby@example.cz · IČO 45274649 Správce',
    ]);
    expect(rows[0].getAttribute('href')).toBe('/sprava/darci/01a18e56-bdb0-775a-bd0a-a60756831369');
  });
});

describe('Given an administrator on the donors page where some donors are people of the foundation', () => {
  let fixture: ComponentFixture<AdminDonors>;
  let http: HttpTestingController;

  beforeEach(async () => {
    vi.useFakeTimers();
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AdminDonors],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AdministrationCopy, useFactory: () => new FakeAdministrationCopy() },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthStore).login('jana@example.cz', 'correct horse battery').subscribe();
    http
      .expectOne('/api/donors/auth/login')
      .flush(authResponse('token-1', sampleDonor({ roles: ['DONOR', 'ADMIN'] })));
    fixture = TestBed.createComponent(AdminDonors);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  async function found(items: ReturnType<typeof donorAccount>[]): Promise<HTMLElement[]> {
    const input = fixture.nativeElement.querySelector('#donor-search') as HTMLInputElement;
    input.value = 'a';
    input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(300);
    http.expectOne((candidate) => candidate.url === SEARCH_URL).flush({ items, hasMore: false });
    fixture.detectChanges();
    return Array.from(fixture.nativeElement.querySelectorAll('tbody tr'));
  }

  it('when a found donor is linked to a person of the foundation by e-mail, then the row shows that portrait, and every other donor their initials', async () => {
    http.expectOne(PEOPLE_URL).flush({
      members: [person({ linkedToAccount: true, fundEmail: 'jana@example.cz' })],
    });

    const [jana, petr] = await found([
      donorAccount(),
      donorAccount({
        donorId: '019a1c00-0000-7000-8000-00000000a002',
        name: 'Petr Svoboda',
        email: 'petr@example.cz',
      }),
    ]);

    expect(jana.querySelector('app-avatar img')?.getAttribute('src')).toBe(
      `/api/content/media/${PORTRAIT_ID}?w=480`,
    );
    expect(petr.querySelector('app-avatar img')).toBeNull();
    expect(petr.querySelector('app-avatar')?.textContent?.trim()).toBe('PS');
  });

  it('when the people of the foundation cannot be loaded, then every donor keeps the initials and no alert shows', async () => {
    http.expectOne(PEOPLE_URL).flush(null, { status: 500, statusText: 'Error' });

    const [jana] = await found([donorAccount()]);

    expect(jana.querySelector('app-avatar img')).toBeNull();
    expect(jana.querySelector('app-avatar')?.textContent?.trim()).toBe('JN');
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });
});
