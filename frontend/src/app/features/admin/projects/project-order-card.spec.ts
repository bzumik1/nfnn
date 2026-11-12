import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DirtyForms } from '../../../core/updates/dirty-forms';
import { ProjectOrder } from '../../content/projects-api';
import { ProjectOrderCard } from './project-order-card';

const ORDER_URL = '/api/admin/content/project-order';

describe('Given an administrator choosing the order of the projects', () => {
  let fixture: ComponentFixture<ProjectOrderCard>;
  let http: HttpTestingController;
  let changes: ProjectOrder[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProjectOrderCard],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ProjectOrderCard);
    changes = [];
    fixture.componentInstance.changed.subscribe((order) => changes.push(order));
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function query<T extends Element>(selector: string): T {
    return fixture.nativeElement.querySelector(selector) as T;
  }

  function text(element: Element | null): string {
    return (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  function radio(order: ProjectOrder): HTMLInputElement {
    return query<HTMLInputElement>(`input[type="radio"][value="${order}"]`);
  }

  async function loaded(order: ProjectOrder = 'YEAR_THEN_CATEGORY'): Promise<void> {
    http.expectOne(ORDER_URL).flush({ order });
    await settle();
  }

  async function submit(): Promise<void> {
    query<HTMLFormElement>('.order-form').requestSubmit();
    await settle();
  }

  it('when the server cannot be reached, then the card says the order shows once the connection is back instead of an error', async () => {
    http.expectOne(ORDER_URL).error(new ProgressEvent('error'));
    await settle();

    expect(query('.ui-load-state--error')).toBeNull();
    expect(text(query('.ui-load-state--inset'))).toBe(
      'Řazení ukážeme, až se spojení se serverem obnoví.',
    );
  });

  it('when the order is still loading, then the card says so', () => {
    expect(text(query('[role="status"].ui-load-state'))).toBe('Načítáme řazení…');
    http.expectOne(ORDER_URL).flush({ order: 'YEAR' });
  });

  it('when the order arrives, then every way of ordering is offered with a description of how it orders, and the saved one is chosen', async () => {
    await loaded('YEAR');

    const options = Array.from(
      fixture.nativeElement.querySelectorAll('input[type="radio"]') as NodeListOf<HTMLInputElement>,
    ).map((input) => ({
      label: text(document.getElementById(input.getAttribute('aria-labelledby')!)),
      description: text(document.getElementById(input.getAttribute('aria-describedby')!)),
      checked: input.checked,
    }));
    expect(options).toEqual([
      {
        label: 'Podle roku, v něm podle kategorie',
        description:
          'Nahoře je nejnovější rok. V každém roce jsou nejdřív příběhy dětí, pak dospělých, zvířat a ostatních, a v každé kategorii od naposledy zveřejněného.',
        checked: false,
      },
      {
        label: 'Podle roku',
        description:
          'Nahoře je nejnovější rok. V každém roce jsou příběhy od naposledy zveřejněného, ať patří do kterékoli kategorie.',
        checked: true,
      },
      {
        label: 'Podle kategorie, v ní podle roku',
        description:
          'Nahoře jsou všechny příběhy dětí, pak dospělých, zvířat a ostatních. V každé kategorii od nejnovějšího roku a v roce od naposledy zveřejněného.',
        checked: false,
      },
    ]);
    expect(text(query('legend'))).toBe('Pořadí příběhů na webu');
  });

  it('when another order is chosen and saved, then it is put to the API, the card confirms it and tells the page', async () => {
    await loaded();

    radio('CATEGORY_THEN_YEAR').click();
    await settle();
    await submit();
    const request = http.expectOne({ method: 'PUT', url: ORDER_URL });
    expect(request.request.body).toEqual({ order: 'CATEGORY_THEN_YEAR' });
    expect(text(query('button[type="submit"]'))).toBe('Ukládáme…');
    expect(query<HTMLButtonElement>('button[type="submit"]').disabled).toBe(true);
    request.flush({ order: 'CATEGORY_THEN_YEAR' });
    await settle();

    expect(text(query('[role="status"]:not(:empty)'))).toBe(
      'Řazení jsme uložili. Web už příběhy ukazuje v tomto pořadí.',
    );
    expect(radio('CATEGORY_THEN_YEAR').checked).toBe(true);
    expect(changes).toEqual(['CATEGORY_THEN_YEAR']);
  });

  it('when another order is chosen and not saved yet, then the page counts as half-filled until it is saved, so a new version of the site waits', async () => {
    const dirtyForms = TestBed.inject(DirtyForms);
    await loaded();
    expect(dirtyForms.any()).toBe(false);

    radio('CATEGORY_THEN_YEAR').click();
    await settle();
    expect(dirtyForms.any()).toBe(true);

    await submit();
    http.expectOne({ method: 'PUT', url: ORDER_URL }).flush({ order: 'CATEGORY_THEN_YEAR' });
    await settle();
    expect(dirtyForms.any()).toBe(false);
  });

  it('when saving fails, then an alert says so, the choice stays and the page is not told', async () => {
    await loaded();

    radio('YEAR').click();
    await settle();
    await submit();
    http
      .expectOne({ method: 'PUT', url: ORDER_URL })
      .flush(null, { status: 500, statusText: 'Error' });
    await settle();

    expect(text(query('[role="alert"]:not(:empty)'))).toBe(
      'Řazení se nepodařilo uložit. Zkuste to prosím znovu.',
    );
    expect(radio('YEAR').checked).toBe(true);
    expect(text(query('button[type="submit"]'))).toBe('Uložit řazení');
    expect(changes).toEqual([]);
  });

  it('when the order cannot be loaded, then an alert offers a retry that asks again', async () => {
    http.expectOne(ORDER_URL).flush(null, { status: 500, statusText: 'Error' });
    await settle();

    expect(text(query('[role="alert"]:not(:empty)'))).toBe(
      'Řazení se nepodařilo načíst. Zkusit znovu',
    );
    query<HTMLButtonElement>('.ui-load-state--error button').click();
    await settle();
    await loaded('YEAR');

    expect(radio('YEAR').checked).toBe(true);
  });
});
