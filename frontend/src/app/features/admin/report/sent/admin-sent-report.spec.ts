import { reportContent, sentReport } from '../../testing/admin-fixtures';
import { LogPageHarness, problem } from '../../logs/testing/log-page-harness';
import { AdminSentReport } from './admin-sent-report';

const SENT_URL = '/api/admin/donations/report/sent?month=2026-10';

describe('Given an administrator opening a sent monthly report', () => {
  let page: LogPageHarness;

  async function open(month = '2026-10'): Promise<void> {
    page = await LogPageHarness.open(
      `/sprava/prehledy/${month}`,
      AdminSentReport,
      '/sprava/prehledy/:month',
    );
  }

  afterEach(() => {
    page.http.verify();
  });

  it('when October was sent in the morning and again by hand, then the latest sending comes first with what it said and the earlier one below with only its sections', async () => {
    await open();
    page.http.expectOne(SENT_URL).flush(
      sentReport({
        deliveries: [
          {
            sentAt: '2026-11-02T11:00:00Z',
            byHand: true,
            recipientCount: 1,
            content: reportContent({
              bankImport: {
                lastSucceededAt: '2026-11-02T10:00:00Z',
                lastFailure: { kind: 'TRANSPORT', attemptedAt: '2026-11-02T11:00:00Z' },
              },
            }),
          },
          {
            sentAt: '2026-11-01T06:00:00Z',
            byHand: false,
            recipientCount: 2,
            content: reportContent({ unpairedPayments: null, bankImport: null }),
          },
        ],
      }),
    );
    await page.settle();

    expect(page.text('h1')).toBe('Přehled za říjen 2026');
    expect(page.texts('h2')).toEqual([
      'Naposledy odesláno 2. 11. 2026 12:00',
      'Dříve odesláno 1. 11. 2026 7:00',
    ]);
    const [latest, earlier] = page.texts('.delivery');
    expect(latest).toContain('Poslal správce ručně, 1 příjemce');
    expect(latest).toContain('Registrovaní dárci k 31. 10. 2026 2');
    expect(latest).toContain('Noví dárci za říjen 2026 2');
    expect(latest).toContain('Přijaté dary za říjen 2026 3 dary 850 Kč');
    expect(latest).toContain('Z toho spárované s registrovanými dárci 2 dary 700 Kč');
    expect(latest).toContain('Přijaté dary od 1. 1. 2026 3 dary 850 Kč');
    expect(latest).toContain('Nespárované příchozí platby za říjen 2026 1 platba 150 Kč');
    expect(latest).toContain('Poslední úspěšné stažení plateb z banky 2. 11. 2026 11:00');
    expect(latest).toContain(
      'Poslední pokus o stažení selhal Fio nebylo dostupné 2. 11. 2026 12:00',
    );
    expect(earlier).toContain('Odeslal web podle nastavení, 2 příjemci');
    expect(earlier).toContain('Přijaté dary za říjen 2026 3 dary 850 Kč');
    expect(earlier).not.toContain('Platby bez dárce');
    expect(earlier).not.toContain('Banka');
    expect(page.has('.recomputed-note')).toBe(false);
  });

  it('when a sending is shown, then it is one card with its heading inside and each section a subheading over plain rows', async () => {
    await open();
    page.http.expectOne(SENT_URL).flush(sentReport());
    await page.settle();

    const delivery = page.fixture.debugElement.nativeElement.querySelector(
      '.delivery',
    ) as HTMLElement;
    const heading = delivery.querySelector(`#${delivery.getAttribute('aria-labelledby')}`);
    expect(delivery.classList).toContain('ui-card');
    expect(heading?.tagName).toBe('H2');
    expect(heading?.classList).toContain('ui-card__title');
    const sections: HTMLElement[] = Array.from(delivery.querySelectorAll('section'));
    expect(sections.length).toBeGreaterThan(0);
    for (const section of sections) {
      const subheading = section.querySelector(`#${section.getAttribute('aria-labelledby')}`);
      expect(subheading?.tagName).toBe('H3');
      expect(subheading?.classList).toContain('ui-card__subtitle');
      expect(section.querySelectorAll('ul.ui-list').length).toBe(1);
    }
    expect(delivery.querySelector('.ui-list--inset')).toBeNull();
  });

  it('when the bank import never succeeded before the sending, then the bank says so', async () => {
    await open();
    page.http.expectOne(SENT_URL).flush(
      sentReport({
        deliveries: [
          {
            sentAt: '2026-11-01T06:00:00Z',
            byHand: false,
            recipientCount: 1,
            content: reportContent({
              donors: null,
              donations: null,
              unpairedPayments: null,
              bankImport: { lastSucceededAt: null, lastFailure: null },
            }),
          },
        ],
      }),
    );
    await page.settle();

    expect(page.text('.delivery')).toContain('Poslední úspěšné stažení plateb z banky Zatím žádné');
    expect(page.text('.delivery')).not.toContain('Dárci');
  });

  it('when October was sent before the sendings were kept, then today’s figures come with a note that the e-mail may have differed and without the bank', async () => {
    await open();
    page.http.expectOne(SENT_URL).flush(
      sentReport({
        firstSentAt: '2026-11-01T06:00:00Z',
        deliveries: [],
        recomputed: reportContent({ bankImport: null }),
      }),
    );
    await page.settle();

    expect(page.texts('h2')).toEqual(['Odesláno 1. 11. 2026 7:00']);
    expect(page.text('.recomputed-note')).toBe(
      'Spočteno z dnešních dat, odeslaný e-mail se mohl lišit. Web tehdy ještě neukládal, co přesně odešlo, proto chybí i stav stahování z banky.',
    );
    expect(page.text('.delivery')).toContain('Přijaté dary za říjen 2026 3 dary 850 Kč');
    expect(page.text('.delivery')).not.toContain('Banka');
  });

  it('when no report went out for the month, then the page says so and leads back to the reports', async () => {
    await open();
    const notFound = problem(
      404,
      'donations/sent-report-not-found',
      'Přehled nenalezen',
      'Za tento měsíc žádný přehled neodešel.',
    );
    page.http.expectOne(SENT_URL).flush(notFound.body, notFound.options);
    await page.settle();

    expect(page.text('[role="alert"]')).toContain('Za říjen 2026 žádný přehled neodešel.');
    expect(page.links('[role="alert"] a')).toEqual([
      { text: 'Zpět na měsíční e-mail', href: '/sprava/prehledy' },
    ]);
  });

  it('when the address names no month, then nothing is asked and the page says no report went out', async () => {
    await open('rijen');

    page.http.expectNone(() => true);
    expect(page.text('h1')).toBe('Odeslaný přehled');
    expect(page.text('[role="alert"]')).toContain('Takový přehled neodešel.');
  });

  it('when the server fails, then the page says so and offers to try again, which asks once more', async () => {
    await open();
    const failed = problem(500, 'server-error', 'Chyba serveru', 'Zkuste to znovu.');
    page.http.expectOne(SENT_URL).flush(failed.body, failed.options);
    await page.settle();

    expect(page.text('[role="alert"]')).toContain('Přehled se nepodařilo načíst.');
    await page.click('Zkusit znovu');
    page.http.expectOne(SENT_URL).flush(sentReport());
    await page.settle();
    expect(page.text('h1')).toBe('Přehled za říjen 2026');
  });
});
