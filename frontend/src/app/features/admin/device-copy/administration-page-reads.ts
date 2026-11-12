/// <reference types="@angular/localize" />

import { computed, inject, Injectable, type Signal } from '@angular/core';
import { map, type Observable } from 'rxjs';
import { type AboutResponse, AboutApi } from '../../content/about-api';
import { type DonateBandResponse, DonateBandApi } from '../../content/donate-band-api';
import {
  type AdminNewsArticleResponse,
  type AdminNewsListResponse,
  NewsApi,
} from '../../content/news-api';
import { type PeopleResponse, PeopleApi } from '../../content/people-api';
import {
  type AdminProjectListResponse,
  type AdminProjectResponse,
  type ProjectOrderResponse,
  ProjectsApi,
} from '../../content/projects-api';
import {
  type AdminActionListResponse,
  type AdminActionResponse,
  AdminApi,
  type AdminBackupsResponse,
  type AdminReportResponse,
  type AdminSettingsResponse,
  type NextReportResponse,
  type ReportSettingsResponse,
  type SentReportResponse,
} from '../admin-api';
import { AdministrationCopy } from './administration-copy';
import { AdministrationReads } from './administration-reads';
import type { CopyAccountRow } from './administration-views';

export const DETAILS_NEED_CONNECTION = $localize`:@@admin.copy.history.detailsNeedConnection:Podrobnosti se ukážou s připojením.`;

export interface AdminActionsRead extends AdminActionListResponse {
  readonly fromCopy: boolean;
}

export interface AdminBackupsRead extends AdminBackupsResponse {
  readonly fromCopy: boolean;
}

export interface CopyAuditRow {
  readonly id: string;
  readonly adminId: string;
  readonly action: string;
  readonly subjectId: string | null;
  readonly performedAt: string;
  readonly client: string | null;
  readonly summary?: string | null;
  readonly donorId?: string | null;
}

interface CopyReportSettingsRow extends ReportSettingsResponse {
  readonly sentReports: SentReportResponse[];
  readonly nextReport?: NextReportResponse;
  readonly lastEndedMonth?: string;
}

type ActionCursor = Pick<AdminActionResponse, 'id' | 'performedAt'>;

@Injectable({ providedIn: 'root' })
export class AdministrationPageReads {
  private readonly reads = inject(AdministrationReads);
  private readonly copy = inject(AdministrationCopy);
  private readonly newsApi = inject(NewsApi);
  private readonly projectsApi = inject(ProjectsApi);
  private readonly aboutApi = inject(AboutApi);
  private readonly donateBandApi = inject(DonateBandApi);
  private readonly peopleApi = inject(PeopleApi);
  private readonly api = inject(AdminApi);

  private readonly news = this.copy.rows<AdminNewsArticleResponse>('content', 'news');
  private readonly projects = this.copy.rows<AdminProjectResponse>('content', 'projects');
  private readonly projectOrders = this.copy.rows<ProjectOrderResponse>('content', 'project-order');
  private readonly aboutRows = this.copy.rows<AboutResponse>('content', 'about');
  private readonly bandRows = this.copy.rows<DonateBandResponse>('content', 'donate-band');
  private readonly peopleRows = this.copy.rows<PeopleResponse>('content', 'people');
  private readonly settingsRows = this.copy.rows<AdminSettingsResponse>('operations', 'settings');
  private readonly backupRows = this.copy.rows<AdminBackupsResponse>('operations', 'backups');
  private readonly reportRows = this.copy.rows<CopyReportSettingsRow>(
    'donations',
    'report-settings',
  );
  private readonly accounts = this.copy.rows<CopyAccountRow>('donors', 'accounts');
  private readonly auditRows = this.copy.rows<CopyAuditRow>('donors', 'audit');

  private readonly contentHeld = computed(() => (this.peopleRows()?.length ?? 0) > 0);
  private readonly operationsHeld = computed(() => (this.settingsRows()?.length ?? 0) > 0);
  private readonly auditNewestFirst = computed(() => {
    const rows = this.auditRows();
    return rows === null ? null : [...rows].sort(newerFirst);
  });

  changed(): void {
    this.reads.changed();
  }

  newsList(): Observable<AdminNewsListResponse> {
    return this.reads.copyFirst(
      () => this.fromContent(this.news, (items) => ({ items: [...items] })),
      () => this.newsApi.list(),
    );
  }

  newsArticle(id: string): Observable<AdminNewsArticleResponse> {
    return this.reads.copyFirst(
      () => this.fromContent(this.news, (items) => items.find((item) => item.id === id) ?? null),
      () => this.newsApi.get(id),
    );
  }

  projectList(): Observable<AdminProjectListResponse> {
    return this.reads.copyFirst(
      () => this.fromContent(this.projects, (items) => ({ items: [...items] })),
      () => this.projectsApi.list(),
    );
  }

  project(id: string): Observable<AdminProjectResponse> {
    return this.reads.copyFirst(
      () =>
        this.fromContent(this.projects, (items) => items.find((item) => item.id === id) ?? null),
      () => this.projectsApi.get(id),
    );
  }

  projectOrder(): Observable<ProjectOrderResponse> {
    return this.reads.copyFirst(
      () => this.fromContent(this.projectOrders, (rows) => rows[0] ?? null),
      () => this.projectsApi.order(),
    );
  }

  about(): Observable<AboutResponse> {
    return this.reads.copyFirst(
      () => this.fromContent(this.aboutRows, (rows) => rows[0] ?? { photo: null }),
      () => this.aboutApi.load(),
    );
  }

  donateBand(): Observable<DonateBandResponse> {
    return this.reads.copyFirst(
      () => this.fromContent(this.bandRows, (rows) => rows[0] ?? { photo: null }),
      () => this.donateBandApi.load(),
    );
  }

  people(): Observable<PeopleResponse> {
    return this.reads.copyFirst(
      () => this.fromContent(this.peopleRows, (rows) => rows[0] ?? null),
      () => this.peopleApi.load(),
    );
  }

  settings(): Observable<AdminSettingsResponse> {
    return this.reads.copyFirst(
      () => this.fromOperations(this.settingsRows),
      () => this.api.settings(),
    );
  }

  backups(): Observable<AdminBackupsRead> {
    return this.reads.copyFirst(
      () => {
        const row = this.fromOperations(this.backupRows);
        return row === null ? null : { ...row, fromCopy: true };
      },
      () =>
        this.api.backups().pipe(map((view): AdminBackupsRead => ({ ...view, fromCopy: false }))),
    );
  }

  report(): Observable<AdminReportResponse> {
    return this.reads.copyFirst(
      () => {
        const row = this.reportRows()?.[0];
        return row === undefined ? null : reportOf(row);
      },
      () => this.api.report(),
    );
  }

  adminActions(after: ActionCursor | null = null, limit = 50): Observable<AdminActionsRead> {
    return this.reads.copyFirst(
      () => {
        const rows = this.auditNewestFirst();
        const accounts = this.accounts();
        return rows === null || accounts === null ? null : actionPage(rows, accounts, after, limit);
      },
      () =>
        this.api
          .adminActions(after, limit)
          .pipe(map((page): AdminActionsRead => ({ ...page, fromCopy: false }))),
    );
  }

  private fromContent<Row, Answer>(
    rows: Signal<readonly Row[] | null>,
    answer: (rows: readonly Row[]) => Answer | null,
  ): Answer | null {
    const held = rows();
    return held === null || !this.contentHeld() ? null : answer(held);
  }

  private fromOperations<Row>(rows: Signal<readonly Row[] | null>): Row | null {
    return this.operationsHeld() ? (rows()?.[0] ?? null) : null;
  }
}

function reportOf(row: CopyReportSettingsRow): AdminReportResponse | null {
  const { sentReports, nextReport, lastEndedMonth, ...settings } = row;
  if (nextReport === undefined || lastEndedMonth === undefined) {
    return null;
  }
  return { settings, sentReports, nextReport, lastEndedMonth };
}

function actionPage(
  rows: readonly CopyAuditRow[],
  accounts: readonly CopyAccountRow[],
  after: ActionCursor | null,
  limit: number,
): AdminActionsRead {
  const start = after === null ? 0 : rows.findIndex((row) => newerFirst(row, after) > 0);
  const from = start < 0 ? rows.length : start;
  const page = rows.slice(from, from + limit);
  const byId = new Map(accounts.map((account) => [account.donorId, account]));
  return {
    items: page.map((row) => {
      const admin = byId.get(row.adminId);
      return {
        id: row.id,
        adminId: row.adminId,
        adminName: admin?.name ?? null,
        adminEmail: admin?.email ?? null,
        action: row.action,
        subjectId: row.subjectId,
        donorId: row.donorId ?? null,
        summary: row.summary ?? DETAILS_NEED_CONNECTION,
        details: '',
        performedAt: row.performedAt,
        client: row.client,
      };
    }),
    hasMore: from + limit < rows.length,
    fromCopy: true,
  };
}

function newerFirst(first: ActionCursor, second: ActionCursor): number {
  const firstAt = instantKey(first.performedAt);
  const secondAt = instantKey(second.performedAt);
  if (firstAt !== secondAt) {
    return firstAt > secondAt ? -1 : 1;
  }
  return first.id === second.id ? 0 : first.id > second.id ? -1 : 1;
}

function instantKey(instant: string): string {
  const seconds = instant.slice(0, 19);
  const fraction = /^\.(\d+)/.exec(instant.slice(19))?.[1] ?? '';
  return `${seconds}.${fraction.padEnd(9, '0')}`;
}
