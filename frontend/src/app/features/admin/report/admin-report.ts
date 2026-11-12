/// <reference types="@angular/localize" />

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
import { Router, RouterLink } from '@angular/router';
import { describeProblem, problemTypeEndsWith } from '../../../core/auth/api-problem';
import { AuthStore } from '../../../core/auth/auth-store';
import { Connectivity } from '../../../core/connectivity/connectivity';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { FocusFirstInvalid } from '../../../shared/ui/form-field/focus-first-invalid';
import { FormControlDirective } from '../../../shared/ui/form-field/form-control';
import { FormField } from '../../../shared/ui/form-field/form-field';
import {
  formatBankTime,
  formatDonationDate,
  pragueDay,
  pragueHour,
} from '../../donations/donation-date';
import {
  AdminApi,
  AdminReportResponse,
  ReportSettingsResponse,
  SentReportResponse,
} from '../admin-api';
import {
  EmailListValidator,
  firstInvalidAddress,
  firstRepeatedAddress,
  MAX_REPORT_RECIPIENTS,
  parseEmailList,
} from './email-list';
import { followingMonth, formatReportMonth, previousMonths } from './report-month';
import { LiveNotice, Notice } from '../../../shared/ui/live-notice/live-notice';
import { NeedsConnection } from '../../../shared/ui/needs-connection/needs-connection';
import {
  isChangedMeanwhile,
  savedAtInRefusal,
  versionInRefusal,
} from '../../../core/version/row-version';
import { DialogAnnouncer } from '../../../shared/ui/dialog/dialog-announcer';
import { ChangedMeanwhileDialog } from '../changed-meanwhile/changed-meanwhile-dialog';
import { formDraft } from '../../../core/drafts/form-draft';
import {
  DRAFT_DISCARDED_TEXT,
  DRAFT_RESUMED_TEXT,
  DraftOffer,
} from '../../../shared/ui/draft-offer/draft-offer';
import { AdministrationPageReads } from '../device-copy/administration-page-reads';

interface ReportDraftValues {
  readonly recipients: string;
  readonly sendDay: number;
  readonly sendHour: number;
  readonly sections: AdminReportResponse['settings']['sections'];
}

type LoadState = 'loading' | 'ready' | 'error';

interface MonthOption {
  value: string;
  label: string;
}

const UNAUTHENTICATED = 'auth/unauthenticated';
const FORBIDDEN = 'auth/forbidden';
const NOT_DELIVERED = 'donations/report-not-delivered';
const RESENDABLE_MONTHS = 24;
const SEND_DAYS = Array.from({ length: 28 }, (_, index) => index + 1);
const SEND_HOURS = Array.from({ length: 24 }, (_, index) => index);

@Component({
  selector: 'app-admin-report',
  imports: [
    LiveNotice,
    RouterLink,
    FormsModule,
    FormField,
    FormControlDirective,
    FocusFirstInvalid,
    EmailListValidator,
    NeedsConnection,
    ChangedMeanwhileDialog,
    DraftOffer,
  ],
  templateUrl: './admin-report.html',
  styleUrl: './admin-report.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminReport {
  private readonly api = inject(AdminApi);
  private readonly reads = inject(AdministrationPageReads);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly loginDialog = inject(LoginDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly title = viewChild.required<ElementRef<HTMLHeadingElement>>('title');
  private readonly sendButton = viewChild<ElementRef<HTMLButtonElement>>('sendButton');
  private readonly sendCancel = viewChild<ElementRef<HTMLButtonElement>>('sendCancel');
  private readonly settingsForm = viewChild<NgForm>('settingsForm');
  private readonly announcer = inject(DialogAnnouncer);

  protected readonly state = signal<LoadState>('loading');
  protected readonly report = signal<AdminReportResponse | null>(null);
  private readonly heldAt = signal<string | null>(null);
  private readonly connectivity = inject(Connectivity);
  protected readonly settingsStatus = signal<string | null>(null);
  protected readonly sendNotice = signal<Notice | null>(null);
  protected readonly mailRefused = signal(false);
  protected readonly saving = signal(false);
  protected readonly sending = signal(false);
  protected readonly settingsError = signal<string | null>(null);
  protected readonly confirmingSend = signal(false);
  protected readonly changedMeanwhile = signal<{
    version: string;
    savedAt: string | null;
    fromDraft: boolean;
  } | null>(null);
  protected readonly sendDays = SEND_DAYS;
  protected readonly sendHours = SEND_HOURS;

  protected readonly recipients = signal('');
  protected readonly recipientMessages = computed(() => {
    const addresses = parseEmailList(this.recipients());
    return {
      required: $localize`:@@admin.report.recipients.required:Vyplňte prosím aspoň jednu e-mailovou adresu.`,
      emailList: $localize`:@@admin.report.recipients.invalid:Adresa „${firstInvalidAddress(addresses) ?? ''}:address:“ není platná e-mailová adresa. Pište každou adresu na vlastní řádek.`,
      emailListLength: $localize`:@@admin.report.recipients.tooMany:Přehled může mít nejvíc ${MAX_REPORT_RECIPIENTS}:max: příjemců.`,
      emailListDuplicate: $localize`:@@admin.report.recipients.duplicate:Adresa „${firstRepeatedAddress(addresses) ?? ''}:address:“ je v seznamu dvakrát.`,
    };
  });

  protected sendDay = 1;
  protected sendHour = 7;
  protected sections = { donors: true, donations: true, unpairedPayments: true, bankImport: true };
  protected month = '';
  protected readonly draft = formDraft<ReportDraftValues>({
    copy: 'administration',
    key: () => 'report-settings',
    values: () => ({
      recipients: this.recipients(),
      sendDay: Number(this.sendDay),
      sendHour: Number(this.sendHour),
      sections: { ...this.sections },
    }),
    apply: (values) => {
      this.recipients.set(values.recipients);
      this.sendDay = values.sendDay;
      this.sendHour = values.sendHour;
      this.sections = { ...values.sections };
      this.settingsForm()?.form.markAsDirty();
    },
  });

  protected readonly changedAt = computed(() => time(this.report()?.settings.changedAt));
  protected readonly nextReport = computed(() => {
    const report = this.report();
    const next = report?.nextReport;
    if (!report || !next) {
      return null;
    }
    const hour = report.settings.sendHour;
    return {
      month: formatReportMonth(next.month),
      dueOn: formatDonationDate(next.dueOn),
      hour: `${hour}:00`,
      overdue: next.month === report.lastEndedMonth && passed(next.dueOn, hour),
      heldAt:
        this.heldAt() !== null && this.connectivity.offline() && passed(next.dueOn, hour)
          ? time(this.heldAt())
          : null,
    };
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
  protected readonly runningMonth = computed(() =>
    formatReportMonth(followingMonth(this.report()?.lastEndedMonth ?? '2000-01')),
  );
  protected readonly runningMonthEnds = computed(() =>
    formatDonationDate(
      `${followingMonth(followingMonth(this.report()?.lastEndedMonth ?? '2000-01'))}-01`,
    ),
  );
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

  protected serverAway(): boolean {
    return this.connectivity.cause() === 'server';
  }

  protected load(): void {
    this.state.set('loading');
    this.fetch();
  }

  private fetch(loaded?: () => void, keepsEdits = false): void {
    this.reads
      .report()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ heldAt, ...report }) => {
          this.heldAt.set(heldAt);
          const previous = this.report();
          if (keepsEdits && previous !== null && this.settingsForm()?.dirty === true) {
            this.report.set({ ...report, settings: previous.settings });
            this.month = report.lastEndedMonth;
            loaded?.();
            return;
          }
          this.report.set(report);
          this.recipients.set(report.settings.recipients.join('\n'));
          this.sendDay = report.settings.sendDay;
          this.sendHour = report.settings.sendHour;
          this.sections = { ...report.settings.sections };
          this.month = report.lastEndedMonth;
          this.state.set('ready');
          this.draft.ready(report.settings.version);
          loaded?.();
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

  protected draftSavedAt(savedAt: string): string {
    return formatBankTime(savedAt);
  }

  protected noSectionChosen(): boolean {
    return !Object.values(this.sections).some(Boolean);
  }

  protected save(form: NgForm): void {
    if (this.saving()) {
      return;
    }
    this.settingsError.set(null);
    this.settingsStatus.set(null);
    if (form.invalid) {
      return;
    }
    if (this.noSectionChosen()) {
      this.settingsError.set(
        $localize`:@@admin.report.sections.required:Vyberte prosím aspoň jednu část přehledu.`,
      );
      return;
    }
    const report = this.report();
    if (report !== null) {
      this.submitSettings(this.draft.staleVersion() ?? report.settings.version);
    }
  }

  protected resumeDraft(): void {
    this.draft.resume();
    this.settingsError.set(null);
    this.settingsStatus.set(DRAFT_RESUMED_TEXT);
    this.focusRecipients();
  }

  protected discardDraft(): void {
    this.draft.discard();
    this.settingsStatus.set(DRAFT_DISCARDED_TEXT);
    this.focusRecipients();
  }

  private focusRecipients(): void {
    afterNextRender(() => document.getElementById('report-recipients')?.focus(), {
      injector: this.injector,
    });
  }

  protected overwriteAfterChange(): void {
    const changed = this.changedMeanwhile();
    if (changed !== null) {
      this.draft.overwriteConfirmed();
      this.submitSettings(changed.version);
    }
  }

  protected reloadAfterChange(): void {
    this.changedMeanwhile.set(null);
    this.settingsError.set(null);
    this.draft.discard();
    this.reads.changed();
    this.fetch(() => {
      this.markSettingsSaved();
      this.settingsStatus.set(
        $localize`:@@admin.report.settings.reloaded:Načetli jsme nastavení, které uložil někdo jiný.`,
      );
    });
  }

  protected keepDraftAfterChange(): void {
    this.changedMeanwhile.set(null);
  }

  private markSettingsSaved(): void {
    afterNextRender(() => this.settingsForm()?.form.markAsPristine(), {
      injector: this.injector,
    });
  }

  private heldSettings(version: string): ReportSettingsResponse | null {
    const shown = this.report()?.settings ?? null;
    return shown !== null && shown.version === version ? shown : null;
  }

  private submitSettings(version: string): void {
    this.saving.set(true);
    this.api
      .changeReportSettings(
        {
          recipients: parseEmailList(this.recipients()),
          sendDay: Number(this.sendDay),
          sendHour: Number(this.sendHour),
          sections: { ...this.sections },
        },
        version,
        this.heldSettings(version),
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.changedMeanwhile.set(null);
          this.draft.discard();
          this.settingsStatus.set(
            $localize`:@@admin.report.settings.saved:Nastavení jsme uložili. Příští přehled odejde podle něj.`,
          );
          this.fetch(() => this.markSettingsSaved());
        },
        error: (failure: unknown) => {
          this.saving.set(false);
          if (isChangedMeanwhile(failure)) {
            const current = versionInRefusal(failure);
            if (current !== null) {
              if (this.changedMeanwhile() !== null) {
                this.announcer.announce(
                  $localize`:@@admin.report.settings.changedAgain:Nastavení mezitím změnil ještě někdo další. Vyberte prosím znovu, co s vašimi úpravami.`,
                );
              }
              this.changedMeanwhile.set({
                version: current,
                savedAt: savedAtInRefusal(failure),
                fromDraft: this.draft.resumedStale(),
              });
              return;
            }
          }
          this.changedMeanwhile.set(null);
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
    this.sendNotice.set(null);
    this.mailRefused.set(false);
    this.confirmingSend.set(true);
    afterNextRender(() => this.sendCancel()?.nativeElement.focus(), { injector: this.injector });
  }

  protected cancelSend(): void {
    this.confirmingSend.set(false);
    this.focusSendButton();
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
          this.sendNotice.set({
            kind: 'status',
            text: $localize`:@@admin.report.send.done:Přehled za ${formatReportMonth(sent.month)}:month: jsme poslali na ${sent.recipients.join(', ')}:recipients:.`,
          });
          this.focusSendButton();
          this.fetch(undefined, true);
        },
        error: (failure: unknown) => {
          this.sending.set(false);
          this.confirmingSend.set(false);
          this.mailRefused.set(problemTypeEndsWith(failure, NOT_DELIVERED));
          this.sendNotice.set({
            kind: 'alert',
            text: describeProblem(
              failure,
              $localize`:@@admin.report.send.failed:Přehled se nepodařilo poslat. Zkuste to prosím znovu.`,
            ),
          });
          this.focusSendButton();
        },
      });
  }

  private focusSendButton(): void {
    afterNextRender(() => this.sendButton()?.nativeElement.focus(), { injector: this.injector });
  }

  private sendToSignIn(): void {
    const returnTo = this.router.url;
    this.auth.logout().subscribe(() => {
      this.router.navigateByUrl('/');
      this.loginDialog.open('login', { returnTo });
    });
  }
}

function passed(isoDay: string, hour: number): boolean {
  const now = new Date().toISOString();
  const today = pragueDay(now);
  return today > isoDay || (today === isoDay && pragueHour(now) >= hour);
}

function time(isoInstant: string | null | undefined): string | null {
  return isoInstant ? formatBankTime(isoInstant) : null;
}
