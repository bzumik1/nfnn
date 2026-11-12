/// <reference types="@angular/localize" />

import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { problemTypeEndsWith } from '../../../../core/auth/api-problem';
import { pluralCategory } from '../../../../core/i18n/plural-category';
import { NeedsConnection } from '../../../../shared/ui/needs-connection/needs-connection';
import { formatMinorUnits } from '../../../donations/donation-amount';
import { formatBankTime, formatDonationDate } from '../../../donations/donation-date';
import {
  AdminApi,
  ReportBankImportResponse,
  ReportContentResponse,
  ReportDeliveryResponse,
  SentReportDetailResponse,
  TallyResponse,
} from '../../admin-api';
import { IMPORT_FAILURE_LABELS } from '../../import-failure-labels';
import { LogPageAccess } from '../../logs/log-page-access';
import { formatReportMonth } from '../report-month';

type LoadState = 'loading' | 'ready' | 'not-found' | 'error';

interface ReportRow {
  title: string;
  meta: string | null;
  value: string;
}

interface ReportGroup {
  title: string;
  rows: ReportRow[];
}

interface ReportBlock {
  key: string;
  heading: string;
  meta: string | null;
  recomputed: boolean;
  groups: ReportGroup[];
}

const MONTH_SHAPE = /^\d{4}-(0[1-9]|1[0-2])$/;
const NOT_FOUND = 'donations/sent-report-not-found';

@Component({
  selector: 'app-admin-sent-report',
  imports: [RouterLink, NeedsConnection],
  templateUrl: './admin-sent-report.html',
  styleUrl: './admin-sent-report.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSentReport {
  private readonly api = inject(AdminApi);
  private readonly access = inject(LogPageAccess);
  private readonly destroyRef = inject(DestroyRef);
  private readonly title = viewChild.required<ElementRef<HTMLHeadingElement>>('title');
  private readonly month = inject(ActivatedRoute).snapshot.paramMap.get('month') ?? '';

  protected readonly known = MONTH_SHAPE.test(this.month);
  protected readonly monthName = this.known ? formatReportMonth(this.month) : '';
  protected readonly state = signal<LoadState>(this.known ? 'loading' : 'not-found');
  protected readonly report = signal<SentReportDetailResponse | null>(null);
  protected readonly blocks = computed(() => {
    const report = this.report();
    return report === null ? [] : reportBlocks(report);
  });

  constructor() {
    if (this.known) {
      this.load();
    }
    afterNextRender(() => this.title().nativeElement.focus());
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .sentReport(this.month)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (report) => {
          this.report.set(report);
          this.state.set('ready');
        },
        error: (failure: unknown) => {
          if (this.access.leavesOn(failure)) {
            return;
          }
          this.state.set(problemTypeEndsWith(failure, NOT_FOUND) ? 'not-found' : 'error');
        },
      });
  }
}

function reportBlocks(report: SentReportDetailResponse): ReportBlock[] {
  if (report.recomputed !== null) {
    return [
      {
        key: 'recomputed',
        heading: $localize`:@@admin.sentReport.sent:Odesláno ${formatBankTime(report.firstSentAt)}:time:`,
        meta: null,
        recomputed: true,
        groups: contentGroups(report.month, report.recomputed),
      },
    ];
  }
  return report.deliveries.map((delivery, index) => ({
    key: delivery.sentAt,
    heading: deliveryHeading(delivery, index, report.deliveries.length),
    meta: deliveryMeta(delivery),
    recomputed: false,
    groups: contentGroups(report.month, delivery.content),
  }));
}

function deliveryHeading(delivery: ReportDeliveryResponse, index: number, count: number): string {
  const time = formatBankTime(delivery.sentAt);
  if (count === 1) {
    return $localize`:@@admin.sentReport.sent:Odesláno ${time}:time:`;
  }
  return index === 0
    ? $localize`:@@admin.sentReport.latest:Naposledy odesláno ${time}:time:`
    : $localize`:@@admin.sentReport.earlier:Dříve odesláno ${time}:time:`;
}

function deliveryMeta(delivery: ReportDeliveryResponse): string {
  const recipients = recipientsText(delivery.recipientCount);
  return delivery.byHand
    ? $localize`:@@admin.sentReport.byHand:Poslal správce ručně, ${recipients}:recipients:`
    : $localize`:@@admin.sentReport.scheduled:Odeslal web podle nastavení, ${recipients}:recipients:`;
}

function contentGroups(month: string, content: ReportContentResponse): ReportGroup[] {
  const monthName = formatReportMonth(month);
  const groups: ReportGroup[] = [];
  if (content.donors !== null) {
    groups.push({
      title: $localize`:@@admin.sentReport.donors:Dárci`,
      rows: [
        {
          title: $localize`:@@admin.sentReport.donors.registered:Registrovaní dárci k ${formatDonationDate(lastDayOf(month))}:date:`,
          meta: null,
          value: String(content.donors.registered),
        },
        {
          title: $localize`:@@admin.sentReport.donors.new:Noví dárci za ${monthName}:month:`,
          meta: null,
          value: String(content.donors.newInMonth),
        },
      ],
    });
  }
  if (content.donations !== null) {
    groups.push({
      title: $localize`:@@admin.sentReport.donations:Dary`,
      rows: [
        giftRow(
          $localize`:@@admin.sentReport.donations.month:Přijaté dary za ${monthName}:month:`,
          content.donations.received,
        ),
        giftRow(
          $localize`:@@admin.sentReport.donations.paired:Z toho spárované s registrovanými dárci`,
          content.donations.paired,
        ),
        giftRow(
          $localize`:@@admin.sentReport.donations.year:Přijaté dary od ${formatDonationDate(`${month.slice(0, 4)}-01-01`)}:date:`,
          content.donations.receivedInYear,
        ),
      ],
    });
  }
  if (content.unpairedPayments !== null) {
    groups.push({
      title: $localize`:@@admin.sentReport.unpaired:Platby bez dárce`,
      rows: [
        {
          title: $localize`:@@admin.sentReport.unpaired.month:Nespárované příchozí platby za ${monthName}:month:`,
          meta: paymentsText(content.unpairedPayments.count),
          value: crowns(content.unpairedPayments),
        },
      ],
    });
  }
  if (content.bankImport !== null) {
    groups.push({
      title: $localize`:@@admin.sentReport.bank:Banka`,
      rows: bankRows(content.bankImport),
    });
  }
  return groups;
}

function giftRow(title: string, tally: TallyResponse): ReportRow {
  return { title, meta: giftsText(tally.count), value: crowns(tally) };
}

function bankRows(bank: ReportBankImportResponse): ReportRow[] {
  const rows: ReportRow[] = [
    {
      title: $localize`:@@admin.sentReport.bank.lastSuccess:Poslední úspěšné stažení plateb z banky`,
      meta: null,
      value:
        bank.lastSucceededAt === null
          ? $localize`:@@admin.sentReport.bank.never:Zatím žádné`
          : formatBankTime(bank.lastSucceededAt),
    },
  ];
  if (bank.lastFailure !== null) {
    rows.push({
      title: $localize`:@@admin.sentReport.bank.lastFailure:Poslední pokus o stažení selhal`,
      meta: IMPORT_FAILURE_LABELS[bank.lastFailure.kind],
      value: formatBankTime(bank.lastFailure.attemptedAt),
    });
  }
  return rows;
}

function lastDayOf(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const day = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month}-${String(day).padStart(2, '0')}`;
}

function crowns(tally: TallyResponse): string {
  return `${formatMinorUnits(tally.totalMinor)}\u00a0Kč`;
}

function giftsText(count: number): string {
  switch (pluralCategory(count)) {
    case 'one':
      return $localize`:@@admin.sentReport.gifts.one:1 dar`;
    case 'few':
      return $localize`:@@admin.sentReport.gifts.few:${count}:count: dary`;
    case 'other':
      return $localize`:@@admin.sentReport.gifts.many:${count}:count: darů`;
  }
}

function paymentsText(count: number): string {
  switch (pluralCategory(count)) {
    case 'one':
      return $localize`:@@admin.sentReport.payments.one:1 platba`;
    case 'few':
      return $localize`:@@admin.sentReport.payments.few:${count}:count: platby`;
    case 'other':
      return $localize`:@@admin.sentReport.payments.many:${count}:count: plateb`;
  }
}

function recipientsText(count: number): string {
  switch (pluralCategory(count)) {
    case 'one':
      return $localize`:@@admin.sentReport.recipients.one:1 příjemce`;
    case 'few':
      return $localize`:@@admin.sentReport.recipients.few:${count}:count: příjemci`;
    case 'other':
      return $localize`:@@admin.sentReport.recipients.many:${count}:count: příjemců`;
  }
}
