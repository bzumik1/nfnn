import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BackupScheduleResponse } from '../admin-api';
import { backupSchedule } from '../testing/admin-fixtures';
import { BackupScheduleCard } from './backup-schedule-card';

const SCHEDULE_URL = '/api/admin/operations/backups/schedule';

describe('Given the backup plan card', () => {
  let fixture: ComponentFixture<BackupScheduleCard>;
  let http: HttpTestingController;
  let saved: BackupScheduleResponse[];

  async function render(schedule: BackupScheduleResponse): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [BackupScheduleCard],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(BackupScheduleCard);
    fixture.componentRef.setInput('schedule', schedule);
    saved = [];
    fixture.componentInstance.saved.subscribe((value) => saved.push(value));
    await settle();
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function field<T extends HTMLElement>(id: string): T {
    return fixture.nativeElement.querySelector(`#${id}`) as T;
  }

  function text(selector: string): string {
    return (fixture.nativeElement.querySelector(selector)?.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async function type(id: string, value: string): Promise<void> {
    const input = field<HTMLInputElement>(id);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    await settle();
  }

  async function choose(id: string, label: string): Promise<void> {
    const select = field<HTMLSelectElement>(id);
    const option = Array.from(select.options).find((candidate) => candidate.text.trim() === label);
    select.value = option?.value ?? '';
    select.dispatchEvent(new Event('change'));
    await settle();
  }

  async function submit(): Promise<void> {
    (fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    await settle();
  }

  afterEach(() => http.verify());

  describe('when the backup container runs the planned schedule', () => {
    beforeEach(() => render(backupSchedule()));

    it('then the fields hold the plan and no warning shows', () => {
      expect(text('h2')).toBe('Plán záloh');
      expect(field<HTMLInputElement>('backup-time').value).toBe('03:00');
      expect(field<HTMLSelectElement>('test-restore-day').selectedOptions[0].text.trim()).toBe(
        'neděle',
      );
      expect(field<HTMLInputElement>('test-restore-time').value).toBe('04:00');
      expect(fixture.nativeElement.querySelector('.applied')).toBeNull();
    });

    it('and the administrator saves another plan, then it is sent and handed to the page', async () => {
      await type('backup-time', '02:30');
      await choose('test-restore-day', 'sobota');
      await type('test-restore-time', '05:15');
      await submit();

      const request = http.expectOne(SCHEDULE_URL);
      expect(request.request.method).toBe('PUT');
      expect(request.request.body).toEqual({
        backupTime: '02:30',
        testRestoreDay: 6,
        testRestoreTime: '05:15',
      });
      expect(text('button[type="submit"]')).toBe('Ukládáme…');
      const answer = backupSchedule({
        backupTime: '02:30',
        testRestoreDay: 6,
        testRestoreTime: '05:15',
      });
      request.flush(answer);
      await settle();

      expect(saved).toEqual([answer]);
      expect(text('button[type="submit"]')).toBe('Uložit plán');
      expect(text('button[type="submit"] + .ui-form-status')).toBe(
        'Plán záloh jsme uložili: denní záloha 2:30, zkušební obnova v sobotu 5:15.',
      );
    });

    it('and a time is cleared, then the field says what to enter and nothing is sent', async () => {
      await type('backup-time', '');
      await submit();

      expect(text('app-form-field:first-of-type')).toContain('Zadejte prosím čas, například 3:00.');
      expect(field<HTMLInputElement>('backup-time').getAttribute('aria-invalid')).toBe('true');
      http.expectNone(SCHEDULE_URL);
    });

    it('and the server refuses the plan, then an alert says why', async () => {
      await submit();
      http.expectOne(SCHEDULE_URL).flush(
        {
          type: 'https://nfnn.cz/problems/operations/backups-unavailable',
          title: 'Zálohy nejsou dostupné',
          detail: 'Složka záloh není připojená.',
          status: 409,
        },
        { status: 409, statusText: 'Conflict' },
      );
      await settle();

      expect(text('[role="alert"]')).toContain('Složka záloh není připojená.');
      expect(saved).toEqual([]);
    });
  });

  it('when the backup container still runs an older plan, then a warning names it', async () => {
    await render(
      backupSchedule({
        backupTime: '02:30',
        testRestoreDay: 6,
        testRestoreTime: '05:15',
        applied: { backupTime: '03:00', testRestoreDay: 7, testRestoreTime: '04:00' },
      }),
    );

    expect(text('.applied')).toBe(
      'Zálohy zatím běží podle plánu „denní záloha 3:00, zkušební obnova v neděli 4:00“; nový převezme do minuty.',
    );
  });

  it('when the backup container has not confirmed any plan, then a warning says how to update it', async () => {
    await render(backupSchedule({ applied: null }));

    expect(text('.applied p')).toBe(
      'Plán se na serveru zatím neprojevil; obvykle to trvá do minuty. Když tato zpráva po obnovení stránky nezmizí, pošlete ji správci serveru.',
    );
    expect(text('.applied details')).toContain('Kontejner záloh zatím nepotvrdil, že plán převzal');
  });
});
