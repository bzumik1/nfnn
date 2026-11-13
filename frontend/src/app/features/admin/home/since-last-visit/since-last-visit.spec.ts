import { signal, type WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Connectivity } from '../../../../core/connectivity/connectivity';
import { AdministrationVisit, type VisitState } from '../../device-copy/administration-visit';
import type { VisitChanges } from '../../device-copy/visit-changes';
import { SinceLastVisit } from './since-last-visit';

const NOTHING: VisitChanges = {
  payments: { count: 0, totalMinor: 0 },
  paired: { count: 0, totalMinor: 0, bookedFrom: null },
  unpaired: { count: 0, totalMinor: 0, bookedFrom: null },
  newDonors: 0,
  receipts: 0,
  otherAdministrators: [],
  anything: false,
};

const BUSY: VisitChanges = {
  payments: { count: 5, totalMinor: 1250000 },
  paired: { count: 3, totalMinor: 750000, bookedFrom: '2026-11-09' },
  unpaired: { count: 2, totalMinor: 500000, bookedFrom: '2026-11-08' },
  newDonors: 3,
  receipts: 2,
  otherAdministrators: [
    { adminId: 'a1', name: 'Pavel Znamenáček', actions: 3 },
    { adminId: 'a2', name: null, actions: 1 },
  ],
  anything: true,
};

function ready(
  changes: VisitChanges,
  seenAt = '2026-11-10T13:05:00Z',
  copiedAt: string | null = null,
): VisitState {
  return { kind: 'ready', seenAt, changes, copiedAt };
}

describe('Given the block of what is new since the last visit on the administration home', () => {
  let state: WritableSignal<VisitState>;
  let opened: WritableSignal<object | null>;
  let offline: WritableSignal<boolean>;
  let dismissed: WritableSignal<boolean>;
  let dismiss: ReturnType<typeof vi.fn<() => void>>;
  let check: ReturnType<typeof vi.fn<() => Promise<void>>>;
  let keepMark: ReturnType<typeof vi.fn<() => Promise<void>>>;
  let fixture: ComponentFixture<SinceLastVisit>;

  beforeEach(async () => {
    state = signal<VisitState>({ kind: 'checking' });
    opened = signal<object | null>(null);
    offline = signal(false);
    dismissed = signal(false);
    dismiss = vi.fn<() => void>(() => dismissed.set(true));
    check = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    keepMark = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    await TestBed.configureTestingModule({
      imports: [SinceLastVisit],
      providers: [
        provideRouter([]),
        { provide: Connectivity, useValue: { offline: offline.asReadonly() } },
        {
          provide: AdministrationVisit,
          useValue: {
            state: state.asReadonly(),
            opened: opened.asReadonly(),
            dismissed: dismissed.asReadonly(),
            check,
            keepMark,
            dismiss,
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(SinceLastVisit);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  async function show(next: VisitState): Promise<void> {
    state.set(next);
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function text(selector: string): string {
    return (fixture.nativeElement.querySelector(selector)?.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function figures(): Record<string, string> {
    const rows: Record<string, string> = {};
    fixture.nativeElement.querySelectorAll('dl > div').forEach((row: HTMLElement) => {
      rows[row.querySelector('dt')?.textContent?.trim() ?? ''] = (
        row.querySelector('dd')?.textContent ?? ''
      )
        .replace(/\s+/g, ' ')
        .trim();
    });
    return rows;
  }

  function links(): { text: string; href: string | null }[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll('a') as NodeListOf<HTMLAnchorElement>,
    ).map((link) => ({
      text: (link.textContent ?? '').replace(/\s+/g, ' ').trim(),
      href: link.getAttribute('href'),
    }));
  }

  it('when it appears, then it is a card named for the last visit that says it is finding out, and it asks for the copy to catch up', () => {
    const card = fixture.nativeElement.querySelector('section.ui-card') as HTMLElement;

    expect(card.getAttribute('aria-labelledby')).toBe('admin-visit-title');
    expect(text('#admin-visit-title')).toBe('Od minulé návštěvy');
    expect(text('[role="status"]')).toBe('Zjišťujeme, co je od minula nového…');
    expect(check).toHaveBeenCalledTimes(1);
    expect(keepMark).not.toHaveBeenCalled();
  });

  it('when the copy of the administration opens after the block appeared, then it asks again for that copy', async () => {
    opened.set({});
    await fixture.whenStable();

    expect(check).toHaveBeenCalledTimes(2);
  });

  it('when the connection comes back or goes away, then it asks again, so the copy catches up or the summary shows what it holds', async () => {
    offline.set(true);
    await fixture.whenStable();
    offline.set(false);
    await fixture.whenStable();

    expect(check).toHaveBeenCalledTimes(3);
  });

  it('when the tab is hidden, then it neither checks nor keeps the mark until the tab shows again', async () => {
    let visibility: DocumentVisibilityState = 'hidden';
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility,
    });
    try {
      document.dispatchEvent(new Event('visibilitychange'));
      await fixture.whenStable();
      opened.set({});
      await show(ready(BUSY));

      expect(check).toHaveBeenCalledTimes(1);
      expect(keepMark).not.toHaveBeenCalled();

      visibility = 'visible';
      document.dispatchEvent(new Event('visibilitychange'));
      await fixture.whenStable();

      expect(check).toHaveBeenCalledTimes(2);
      expect(keepMark).toHaveBeenCalled();
    } finally {
      delete (document as unknown as Record<string, unknown>)['visibilityState'];
    }
  });

  it('when no copy of the administration is open, then the card is not shown', async () => {
    await show({ kind: 'closed' });

    expect((fixture.nativeElement as HTMLElement).hidden).toBe(true);
  });

  it('when the summary was compared offline, then it says the copy may not be up to date and from when it is', async () => {
    await show(ready(BUSY, '2026-11-10T13:05:00Z', '2026-11-12T08:00:00Z'));

    expect(text('.visit-offline')).toBe(
      'Bez spojení se serverem vidíte údaje z 12. 11. 2026 9:00. Nemusí být aktuální.',
    );
  });

  it('when the summary was compared online, then it says nothing about the connection', async () => {
    await show(ready(BUSY));

    expect(fixture.nativeElement.querySelector('.visit-offline')).toBeNull();
  });

  it('when several of each came in, then each reads in its plural form', async () => {
    const cases: [VisitChanges, string, string, string][] = [
      [
        {
          ...BUSY,
          payments: { count: 3, totalMinor: 30000 },
          newDonors: 2,
          otherAdministrators: [{ adminId: 'a1', name: 'Pavel Znamenáček', actions: 2 }],
        },
        'Od té doby přišly 3 platby za 300 Kč.',
        '2 nové registrace',
        'Pavel Znamenáček: 2 úkony',
      ],
      [
        {
          ...BUSY,
          payments: { count: 12, totalMinor: 120000 },
          newDonors: 5,
          otherAdministrators: [{ adminId: 'a1', name: 'Pavel Znamenáček', actions: 7 }],
        },
        'Od té doby přišlo 12 plateb za 1 200 Kč.',
        '5 nových registrací',
        'Pavel Znamenáček: 7 úkonů',
      ],
    ];
    for (const [changes, lead, donors, others] of cases) {
      await show(ready(changes));

      expect(text('.since-lead')).toContain(lead);
      expect(figures()['Noví dárci']).toBe(donors);
      expect(figures()['Úkony dalších správců']).toBe(others);
    }
  });

  it('when a lot came in, then it names the last visit, sums the payments and lists every kind with its link', async () => {
    await show(ready(BUSY));

    expect(text('.since-lead')).toBe(
      'Minulá návštěva na tomto zařízení byla 10. 11. 2026 14:05. Od té doby přišlo 5 plateb za 12 500 Kč.',
    );
    expect(figures()).toEqual({
      'Přiřazené dárcům': '3 platby za 7 500 Kč',
      'Čekají na přiřazení': '2 platby za 5 000 Kč',
      'Noví dárci': '3 nové registrace',
      'Vydaná potvrzení': '2 potvrzení',
      'Úkony dalších správců': 'Pavel Znamenáček: 3 úkony, jiný správce: 1 úkon',
    });
    expect(links()).toEqual([
      { text: '3 platby za 7 500 Kč', href: '/sprava/platby?stav=prirazene&od=2026-11-09' },
      { text: '2 platby za 5 000 Kč', href: '/sprava/platby?od=2026-11-08' },
      { text: '3 nové registrace', href: '/sprava/darci' },
      {
        text: 'Pavel Znamenáček: 3 úkony, jiný správce: 1 úkon',
        href: '/sprava/historie',
      },
    ]);
    expect(keepMark).toHaveBeenCalled();
  });

  it('when one of each came in, then each reads in the singular and a kind with none says so without a link', async () => {
    await show(
      ready({
        ...NOTHING,
        payments: { count: 1, totalMinor: 50000 },
        paired: { count: 1, totalMinor: 50000, bookedFrom: '2026-11-11' },
        newDonors: 1,
        receipts: 1,
        otherAdministrators: [{ adminId: 'a1', name: 'Pavel Znamenáček', actions: 1 }],
        anything: true,
      }),
    );

    expect(text('.since-lead')).toBe(
      'Minulá návštěva na tomto zařízení byla 10. 11. 2026 14:05. Od té doby přišla 1 platba za 500 Kč.',
    );
    expect(figures()).toEqual({
      'Přiřazené dárcům': '1 platba za 500 Kč',
      'Čekají na přiřazení': 'žádná',
      'Noví dárci': '1 nová registrace',
      'Vydaná potvrzení': '1 potvrzení',
      'Úkony dalších správců': 'Pavel Znamenáček: 1 úkon',
    });
    expect(links().map((link) => link.href)).toEqual([
      '/sprava/platby?stav=prirazene&od=2026-11-11',
      '/sprava/darci',
      '/sprava/historie',
    ]);
  });

  it('when only another administrator acted, then no payment came and the payment figures are left out', async () => {
    await show(
      ready({
        ...NOTHING,
        otherAdministrators: [{ adminId: 'a1', name: 'Pavel Znamenáček', actions: 4 }],
        anything: true,
      }),
    );

    expect(text('.since-lead')).toBe(
      'Minulá návštěva na tomto zařízení byla 10. 11. 2026 14:05. Od té doby nepřišla žádná platba.',
    );
    expect(figures()).toEqual({
      'Noví dárci': 'žádní',
      'Vydaná potvrzení': 'žádná',
      'Úkony dalších správců': 'Pavel Znamenáček: 4 úkony',
    });
  });

  it('when nothing is new, then it says so in one sentence instead of zeros', async () => {
    await show(ready(NOTHING));

    expect(text('.since-lead')).toBe(
      'Minulá návštěva na tomto zařízení byla 10. 11. 2026 14:05. Od té doby nepřibylo nic nového.',
    );
    expect(fixture.nativeElement.querySelector('dl')).toBeNull();
    expect(keepMark).toHaveBeenCalled();
  });

  it('when this is the first visit on this device, then it says what it will show next time and keeps the mark', async () => {
    await show({ kind: 'first' });

    expect(text('.since-lead')).toBe(
      'Na tomto zařízení zatím není s čím porovnat. Příště tu uvidíte, co mezitím přibylo: platby, dárci, potvrzení a úkony dalších správců.',
    );
    expect(keepMark).toHaveBeenCalled();
  });

  it('when this device keeps nothing of the administration, then it says it has nothing to compare with', async () => {
    await show({ kind: 'not-kept' });

    expect(text('.since-lead')).toBe(
      'V tomto prohlížeči se správa neukládá, a tak tu není s čím porovnat, co od minula přibylo. Souhrn uvidíte na zařízení, kde se správa ukládá.',
    );
    expect(keepMark).not.toHaveBeenCalled();
  });

  it('when the copy cannot catch up, then an alert offers a retry that checks again', async () => {
    await show({ kind: 'failed' });

    const alert = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;
    expect(alert.textContent).toContain('Co je od minula nového, se nepodařilo zjistit.');

    (alert.querySelector('button') as HTMLButtonElement).click();

    expect(check).toHaveBeenCalledTimes(2);
    expect(document.activeElement?.id).toBe('admin-visit-title');
  });

  it('when the summary is closed, then the card goes away for this visit', async () => {
    await show(ready(BUSY));

    (Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[])
      .find((button) => button.textContent?.trim() === 'Zavřít souhrn')
      ?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(dismiss).toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).hidden).toBe(true);
  });

  it('when this device keeps nothing of the administration, then the card can be closed', async () => {
    await show({ kind: 'not-kept' });

    expect(
      (Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[]).map(
        (button) => button.textContent?.trim(),
      ),
    ).toEqual(['Zavřít souhrn']);
  });

  it('when it is the first visit, then there is no summary to close', async () => {
    await show({ kind: 'first' });

    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });
});
