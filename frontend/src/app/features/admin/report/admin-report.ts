import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule, NgForm } from '@angular/forms';
import { Router } from '@angular/router';
import { describeProblem, problemTypeEndsWith } from '../../../core/auth/api-problem';
import { AuthStore } from '../../../core/auth/auth-store';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { FocusFirstInvalid } from '../../../shared/ui/form-field/focus-first-invalid';
import { FormControlDirective } from '../../../shared/ui/form-field/form-control';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { formatBankTime, formatDonationDate } from '../../donations/donation-date';
import { AdminApi, AdminReportResponse, SentReportResponse } from '../admin-api';
import { EmailListValidator, MAX_REPORT_RECIPIENTS, parseEmailList } from './email-list';
import { formatReportMonth, previousMonths } from './report-month';
import { LiveNotice, Notice } from '../../../shared/ui/live-notice/live-notice';

type LoadState = 'loading' | 'ready' | 'error';

interface MonthOption {
  value: string;
  label: string;
}

const UNAUTHENTICATED = 'auth/unauthenticated';
const FORBIDDEN = 'auth/forbidden';
const RESENDABLE_MONTHS = 24;
const SEND_DAYS = Array.from({ length: 28 }, (_, index) => index + 1);

@Component({
  selector: 'app-admin-report',
  imports: [
    LiveNotice,
    FormsModule,
    FormField,
    FormControlDirective,
    FocusFirstInvalid,
    EmailListValidator,
  ],
  templateUrl: './admin-report.html',
  styleUrl: './admin-report.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminReport {
  private readonly api = inject(AdminApi);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly loginDialog = inject(LoginDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly title = viewChild.required<ElementRef<HTMLHeadingElement>>('title');

  protected readonly state = signal<LoadState>('loading');
  protected readonly report = signal<AdminReportResponse | null>(null);
  protected readonly notice = signal<Notice | null>(null);
  protected readonly saving = signal(false);
  protected readonly sending = signal(false);
  protected readonly settingsError = signal<string | null>(null);
  protected readonly confirmingSend = signal(false);
  protected readonly sendDays = SEND_DAYS;

  protected readonly recipientMessages = {
    required: $localize`:@@admin.report.recipients.required:Vyplňte prosím aspoň jednu e-mailovou adresu.`,
    emailList: $localize`:@@admin.report.recipients.invalid:Některá z adres není platná e-mailová adresa. Pište každou na vlastní řádek.`,
    emailListLength: $localize`:@@admin.report.recipients.tooMany:Přehled může mít nejvíc ${MAX_REPORT_RECIPIENTS}:max: příjemců.`,
    emailListDuplicate: $localize`:@@admin.report.recipients.duplicate:Některá adresa je v seznamu dvakrát.`,
  };

  protected recipients = '';
  protected sendDay = 1;
  protected sections = { donors: true, donations: true, unpairedPayments: true, bankImport: true };
  protected month = '';

  protected readonly changedAt = computed(() => time(this.report()?.settings.changedAt));
  protected readonly nextReport = computed(() => {
    const next = this.report()?.nextReport;
    return next
      ? { month: formatReportMonth(next.month), dueOn: formatDonationDate(next.dueOn) }
      : null;
  });
  protected readonly sentReports = computed(() => this.report()?.sentReports ?? []);
  protected readonly monthOptions = computed<MonthOption[]>(() => {
    const report = this.report();
    if (!report) {
      return [];
    }
    const sent = new Map(report.sentReports.map((item) => [item.month, item.sentAt]));
    return previousMonths(report.lastEndedMonth, RESENDABLE_MONTHS).map((value) => {
      const sentAt = sent.get(value);
      return {
        value,
        label: sentAt
          ? $localize`:@@admin.report.send.option.sent:${formatReportMonth(value)}:month: (odesláno ${formatDonationDate(sentAt)}:date:)`
          : $localize`:@@admin.report.send.option.unsent:${formatReportMonth(value)}:month: (zatím neodesláno)`,
      };
    });
  });
  protected readonly selectedMonthLabel = computed(() =>
    formatReportMonth(this.month || '2000-01'),
  );
  protected readonly currentRecipients = computed(
    () => this.report()?.settings.recipients.join(', ') ?? '',
  );

  constructor() {
    this.load();
    afterNextRender(() => this.title().nativeElement.focus(), { injector: this.injector });
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .report()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (report) => {
          this.report.set(report);
          this.recipients = report.settings.recipients.join('\n');
          this.sendDay = report.settings.sendDay;
          this.sections = { ...report.settings.sections };
          this.month = report.lastEndedMonth;
          this.state.set('ready');
        },
        error: (failure: unknown) => {
          if (problemTypeEndsWith(failure, UNAUTHENTICATED)) {
            this.sendToSignIn();
            return;
          }
          if (problemTypeEndsWith(failure, FORBIDDEN)) {
            this.router.navigateByUrl('/darce/prehled');
            return;
          }
          this.state.set('error');
        },
      });
  }

  protected formatMonth(isoMonth: string): string {
    return formatReportMonth(isoMonth);
  }

  protected sentTime(item: SentReportResponse): string {
    return formatBankTime(item.sentAt);
  }

  protected noSectionChosen(): boolean {
    return !Object.values(this.sections).some(Boolean);
  }

  protected save(form: NgForm): void {
    if (this.saving()) {
      return;
    }
    this.settingsError.set(null);
    this.notice.set(null);
    if (form.invalid) {
      return;
    }
    if (this.noSectionChosen()) {
      this.settingsError.set(
        $localize`:@@admin.report.sections.required:Vyberte prosím aspoň jednu část přehledu.`,
      );
      return;
    }
    this.saving.set(true);
    this.api
      .changeReportSettings({
        recipients: parseEmailList(this.recipients),
        sendDay: Number(this.sendDay),
        sections: { ...this.sections },
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.notice.set({
            kind: 'status',
            text: $localize`:@@admin.report.settings.saved:Nastavení jsme uložili. Příští přehled odejde podle něj.`,
          });
          this.load();
        },
        error: (failure: unknown) => {
          this.saving.set(false);
          this.settingsError.set(
            describeProblem(
              failure,
              $localize`:@@admin.report.settings.failed:Nastavení se nepodařilo uložit. Zkuste to prosím znovu.`,
            ),
          );
        },
      });
  }

  protected askSend(): void {
    this.notice.set(null);
    this.confirmingSend.set(true);
  }

  protected cancelSend(): void {
    this.confirmingSend.set(false);
  }

  protected send(): void {
    if (this.sending() || !this.month) {
      return;
    }
    this.sending.set(true);
    this.api
      .sendReport(this.month)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (sent) => {
          this.sending.set(false);
          this.confirmingSend.set(false);
          this.notice.set({
            kind: 'status',
            text: $localize`:@@admin.report.send.done:Přehled za ${formatReportMonth(sent.month)}:month: jsme poslali na ${sent.recipients.join(', ')}:recipients:.`,
          });
          this.load();
        },
        error: (failure: unknown) => {
          this.sending.set(false);
          this.confirmingSend.set(false);
          this.notice.set({
            kind: 'alert',
            text: describeProblem(
              failure,
              $localize`:@@admin.report.send.failed:Přehled se nepodařilo poslat. Zkuste to prosím znovu.`,
            ),
          });
        },
      });
  }

  private sendToSignIn(): void {
    const returnTo = this.router.url;
    this.auth.logout().subscribe(() => {
      this.router.navigateByUrl('/');
      this.loginDialog.open('login', { returnTo });
    });
  }
}

function time(isoInstant: string | null | undefined): string | null {
  return isoInstant ? formatBankTime(isoInstant) : null;
}
