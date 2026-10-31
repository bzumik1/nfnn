import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { authInterceptor } from '../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../core/auth/auth-store';
import { authResponse, sampleDonor } from '../../../core/auth/testing/donor-fixtures';
import { person, PORTRAIT_ID } from '../../content/testing/people-fixtures';
import { administrator } from '../testing/admin-fixtures';
import { AdminAdministrators } from './admin-administrators';

const LIST_URL = '/api/admin/donors/administrators';
const PEOPLE_URL = '/api/admin/content/people';
const PETR_ID = '019a1c00-0000-7000-8000-00000000a002';

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

describe('Given an administrator on the administrators page', () => {
  let fixture: ComponentFixture<AdminAdministrators>;
  let http: HttpTestingController;

  const jana = administrator();
  const petr = administrator({
    donorId: PETR_ID,
    name: 'Petr Svoboda',
    email: 'petr@example.cz',
    secondFactorEnabled: false,
  });

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AdminAdministrators],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const store = TestBed.inject(AuthStore);
    store.login('jana@example.cz', 'correct horse battery').subscribe();
    http
      .expectOne('/api/donors/auth/login')
      .flush(authResponse('token-1', sampleDonor({ roles: ['DONOR', 'ADMIN'] })));
    fixture = TestBed.createComponent(AdminAdministrators);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  function element<T extends HTMLElement>(selector: string): T {
    const found = fixture.nativeElement.querySelector(selector) as T | null;
    if (found === null) {
      throw new Error(`No element matches ${selector}`);
    }
    return found;
  }

  function text(selector: string): string {
    return (fixture.nativeElement.querySelector(selector)?.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function rows(): HTMLElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.administrator-row'));
  }

  function rowText(row: HTMLElement): string {
    return (row.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  function button(row: HTMLElement, name: string): HTMLButtonElement {
    const found = Array.from(row.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.trim() === name,
    );
    if (found === undefined) {
      throw new Error(`No button "${name}" in "${rowText(row)}"`);
    }
    return found;
  }

  function badges(row: HTMLElement): string[] {
    return Array.from(row.querySelectorAll('.ui-person-row__badges li')).map((badge) =>
      (badge.textContent ?? '').trim(),
    );
  }

  function peopleArrive(members = [person({ linkedToAccount: false })]): void {
    http.expectOne(PEOPLE_URL).flush({ members, note: null, footnote: null });
  }

  async function listed(items = [jana, petr]): Promise<void> {
    if (http.match(PEOPLE_URL).length > 0) {
      throw new Error('The people of the foundation are asked for only once');
    }
    http.expectOne(LIST_URL).flush({ items });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('when the list arrives, then every administrator is a row with a round avatar, the name, the e-mail and badges, and the signed-in one has no buttons', async () => {
    expect(text('[role="status"]:not(:empty)')).toBe('Načítáme správce…');
    peopleArrive();

    await listed();

    const [first, second] = rows();
    expect(first.querySelector('.ui-person-row__name')?.textContent?.trim()).toBe('Jana Nováková');
    expect(text('.administrator-row:first-child .ui-person-row__meta')).toBe('jana@example.cz');
    expect(badges(first)).toEqual(['To jste vy', 'Dvoufaktorové ověření zapnuté']);
    expect(first.querySelector('app-avatar')?.textContent?.trim()).toBe('JN');
    expect(rowText(first)).toContain('Svůj účet spravujete v Údajích a zabezpečení.');
    expect(first.querySelector('.ui-person-row__note a')?.getAttribute('href')).toBe(
      '/darce/udaje',
    );
    expect(first.querySelectorAll('button')).toHaveLength(0);
    expect(second.querySelector('a.admin-name')?.getAttribute('href')).toBe(
      `/sprava/darci/${PETR_ID}`,
    );
    expect(badges(second)).toEqual(['Dvoufaktorové ověření vypnuté']);
    expect(rowText(second)).toContain('Správa se mu otevře jen přístupovým klíčem.');
    expect(second.querySelector('app-avatar')?.textContent?.trim()).toBe('PS');
    expect(second.querySelector('.ui-person-row__actions')).not.toBeNull();
    expect(button(second, 'Odebrat roli správce')).toBeTruthy();
    expect(second.querySelectorAll('button')).toHaveLength(1);
  });

  it('when a person of the foundation is linked to an administrator by e-mail, then the row shows the portrait of the first such person, as the top bar does', async () => {
    peopleArrive([
      person({ name: 'Eva Vzorová', linkedToAccount: true, fundEmail: 'jana@example.cz' }),
      person({ id: 'unlinked', linkedToAccount: false, personalEmail: 'petr@example.cz' }),
      person({
        id: 'first',
        name: 'Petr Svoboda',
        linkedToAccount: true,
        personalEmail: 'petr@example.cz',
        portrait: null,
      }),
      person({ id: 'later', linkedToAccount: true, fundEmail: 'petr@example.cz' }),
    ]);

    await listed();

    const [first, second] = rows();
    expect(first.querySelector('app-avatar img')?.getAttribute('src')).toBe(
      `/api/content/media/${PORTRAIT_ID}?w=480`,
    );
    expect(first.querySelector('app-avatar img')?.getAttribute('alt')).toBe('');
    expect(second.querySelector('app-avatar img')).toBeNull();
    expect(second.querySelector('app-avatar')?.textContent?.trim()).toBe('PS');
  });

  it('when the people of the foundation cannot be loaded, then every administrator keeps the initials and no alert shows', async () => {
    http.expectOne(PEOPLE_URL).flush(null, { status: 500, statusText: 'Error' });

    await listed();

    expect(rows()).toHaveLength(2);
    expect(rows()[0].querySelector('app-avatar')?.textContent?.trim()).toBe('JN');
    expect(text('[role="alert"]:not(:empty)')).toBe('');
  });

  it('when the list cannot be loaded, then an alert offers a retry that loads again', async () => {
    peopleArrive();
    http.expectOne(LIST_URL).flush(null, { status: 500, statusText: 'Error' });
    fixture.detectChanges();

    expect(text('[role="alert"]:not(:empty)')).toContain('Správce se nepodařilo načíst.');
    element<HTMLButtonElement>('.ui-load-state--error button').click();
    fixture.detectChanges();

    await listed([jana]);
    expect(rows()).toHaveLength(1);
  });

  it('when a registered e-mail is added, then the new administrator is listed and the status says the administration waits for two-factor authentication', async () => {
    peopleArrive();
    await listed([jana]);

    const input = element<HTMLInputElement>('#grant-email');
    input.value = 'petr@example.cz';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    element<HTMLFormElement>('form').dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    const request = http.expectOne('/api/admin/donors/administrators');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ email: 'petr@example.cz' });
    expect(element<HTMLButtonElement>('.grant-submit').disabled).toBe(true);
    request.flush(petr, { status: 201, statusText: 'Created' });
    fixture.detectChanges();

    expect(text('.ui-notice--status')).toBe(
      'Petr Svoboda je teď správce. Správa se mu otevře, až se přihlásí s kódem z ověřovací aplikace nebo přístupovým klíčem.',
    );
    expect(element<HTMLInputElement>('#grant-email').value).toBe('');
    await listed([jana, petr]);
    expect(rows()).toHaveLength(2);
  });

  it('when the e-mail is empty, then the field says so and nothing is sent', async () => {
    peopleArrive();
    await listed([jana]);

    element<HTMLFormElement>('form').dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text('app-form-field')).toContain('Vyplňte prosím e-mail registrovaného dárce.');
    expect(element<HTMLInputElement>('#grant-email').getAttribute('aria-invalid')).toBe('true');
    http.expectNone('/api/admin/donors/administrators');
  });

  it('when nobody is registered with the e-mail, then the refusal stays at the form as an alert', async () => {
    peopleArrive();
    await listed([jana]);

    const input = element<HTMLInputElement>('#grant-email');
    input.value = 'nikdo@example.cz';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    element<HTMLFormElement>('form').dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    const refusal = problem(
      404,
      'donors/email-not-registered',
      'S tímto e-mailem není nikdo registrován',
      'Správcem může být jen registrovaný dárce.',
    );
    http.expectOne('/api/admin/donors/administrators').flush(refusal.body, refusal.options);
    fixture.detectChanges();

    expect(text('.form-error')).toBe(
      'S tímto e-mailem není nikdo registrován. Správcem může být jen registrovaný dárce.',
    );
    expect(element<HTMLInputElement>('#grant-email').value).toBe('nikdo@example.cz');
  });

  it('when another administrator is removed after the confirmation, then the list reloads and the status says their sign-ins ended', async () => {
    peopleArrive();
    await listed();

    button(rows()[1], 'Odebrat roli správce').click();
    fixture.detectChanges();
    expect(rowText(rows()[1])).toContain(
      'Petr Svoboda přestane být správcem a všechna jeho přihlášení skončí. Jeho dárcovský účet zůstane. Odebrat roli správce?',
    );
    expect(rows()[1].querySelector('[role="group"]')?.getAttribute('aria-label')).toBe(
      'Odebrat roli správce: Petr Svoboda?',
    );
    button(rows()[1], 'Ano, odebrat').click();
    fixture.detectChanges();

    const request = http.expectOne(`/api/admin/donors/administrators/${PETR_ID}`);
    expect(request.request.method).toBe('DELETE');
    request.flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text('.ui-notice--status')).toBe(
      'Petr Svoboda už není správce. Všechna jeho přihlášení jsme ukončili.',
    );
    expect(document.activeElement).toBe(element('app-live-notice'));
    await listed([jana]);
    expect(rows()).toHaveLength(1);
  });

  it('when "Ponechat" answers the confirmation, then nothing is sent, the buttons come back and the focus returns to the opener', async () => {
    peopleArrive();
    await listed();

    button(rows()[1], 'Odebrat roli správce').click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement).toBe(button(rows()[1], 'Ponechat'));
    button(rows()[1], 'Ponechat').click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(rowText(rows()[1])).not.toContain('Odebrat roli správce?');
    expect(document.activeElement).toBe(button(rows()[1], 'Odebrat roli správce'));
    http.expectNone(`/api/admin/donors/administrators/${PETR_ID}`);
  });

  it('when two-factor authentication of another administrator is turned off, then the confirmation asks about the owner and the status names the e-mail', async () => {
    const petrWithFactor = { ...petr, secondFactorEnabled: true };
    peopleArrive();
    await listed([jana, petrWithFactor]);

    button(rows()[1], 'Vypnout dvoufaktorové ověření').click();
    fixture.detectChanges();
    expect(rowText(rows()[1])).toContain(
      'Ověřili jste, že žádá majitel účtu (například odpověděl z registrovaného e-mailu)?',
    );
    button(rows()[1], 'Ano, vypnout').click();
    fixture.detectChanges();

    const request = http.expectOne(`/api/admin/donors/${PETR_ID}/second-factor/reset`);
    expect(request.request.method).toBe('POST');
    request.flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();

    expect(text('.ui-notice--status')).toBe(
      'Dvoufaktorové ověření u Petr Svoboda je vypnuté a všechna jeho přihlášení jsme ukončili. Poslali jsme mu e-mail; po přihlášení heslem si ho může zapnout znovu.',
    );
    await listed([jana, petr]);
    expect(rowText(rows()[1])).not.toContain('Vypnout dvoufaktorové ověření');
  });

  it('when the removal is refused, then the alert shows the backend title and the list stays', async () => {
    peopleArrive();
    await listed();

    button(rows()[1], 'Odebrat roli správce').click();
    fixture.detectChanges();
    button(rows()[1], 'Ano, odebrat').click();
    fixture.detectChanges();
    const refusal = problem(
      409,
      'donors/not-administrator',
      'Tento dárce není správce',
      'Není co odebrat.',
    );
    http
      .expectOne(`/api/admin/donors/administrators/${PETR_ID}`)
      .flush(refusal.body, refusal.options);
    fixture.detectChanges();

    await fixture.whenStable();
    fixture.detectChanges();

    expect(text('.ui-notice--alert')).toBe('Tento dárce není správce. Není co odebrat.');
    expect(rows()).toHaveLength(2);
    expect(document.activeElement).toBe(button(rows()[1], 'Odebrat roli správce'));
  });

  it('when the role was taken away meanwhile, then the page goes to the overview', async () => {
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const refusal = problem(403, 'auth/forbidden', 'Nemáte oprávnění', 'Jen pro správce.');

    peopleArrive();
    http.expectOne(LIST_URL).flush(refusal.body, refusal.options);
    fixture.detectChanges();

    expect(navigate).toHaveBeenCalledWith('/darce/prehled');
  });
});
