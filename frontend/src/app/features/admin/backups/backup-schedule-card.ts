import {
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule, NgForm } from '@angular/forms';
import { describeProblem } from '../../../core/auth/api-problem';
import { FocusFirstInvalid } from '../../../shared/ui/form-field/focus-first-invalid';
import { FormControlDirective } from '../../../shared/ui/form-field/form-control';
import { FieldMessages, FormField } from '../../../shared/ui/form-field/form-field';
import { AdminApi, BackupScheduleResponse } from '../admin-api';
import { BACKUP_DAYS, describePlan, samePlan } from './backup-plan';

const TIME_MESSAGES: FieldMessages = {
  required: $localize`:@@admin.backups.schedule.time.required:Zadejte prosím čas, například 3:00.`,
};

@Component({
  selector: 'app-backup-schedule-card',
  imports: [FormsModule, FormField, FormControlDirective, FocusFirstInvalid],
  templateUrl: './backup-schedule-card.html',
  styleUrl: './backup-schedule-card.scss',
})
export class BackupScheduleCard {
  private readonly api = inject(AdminApi);
  private readonly destroyRef = inject(DestroyRef);

  readonly schedule = input.required<BackupScheduleResponse>();
  readonly disabled = input(false);
  readonly saved = output<BackupScheduleResponse>();

  protected readonly days = BACKUP_DAYS;
  protected readonly timeMessages = TIME_MESSAGES;
  protected readonly backupTime = linkedSignal(() => this.schedule().backupTime);
  protected readonly testRestoreDay = linkedSignal(() => this.schedule().testRestoreDay);
  protected readonly testRestoreTime = linkedSignal(() => this.schedule().testRestoreTime);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly applied = computed(() => {
    const schedule = this.schedule();
    if (schedule.applied === null) {
      return $localize`:@@admin.backups.schedule.applied.unknown:Kontejner záloh zatím nepotvrdil, že plán převzal; obvykle to trvá do minuty. Když hláška po obnovení stránky nezmizí, běží starší verze kontejneru: aktualizujte aplikaci v ZimaOS (Uložit v jejím nastavení).`;
    }
    if (!samePlan(schedule, schedule.applied)) {
      return $localize`:@@admin.backups.schedule.applied.old:Kontejner záloh zatím jede podle plánu „${describePlan(schedule.applied)}:plan:“; nový převezme do minuty.`;
    }
    return null;
  });

  protected save(form: NgForm): void {
    if (this.saving()) {
      return;
    }
    this.error.set(null);
    if (form.invalid) {
      return;
    }
    this.saving.set(true);
    this.api
      .changeBackupSchedule({
        backupTime: this.backupTime(),
        testRestoreDay: Number(this.testRestoreDay()),
        testRestoreTime: this.testRestoreTime(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (schedule) => {
          this.saving.set(false);
          this.saved.emit(schedule);
        },
        error: (failure: unknown) => {
          this.saving.set(false);
          this.error.set(
            describeProblem(
              failure,
              $localize`:@@admin.backups.schedule.failed:Plán se nepodařilo uložit. Zkuste to prosím znovu.`,
            ),
          );
        },
      });
  }
}
