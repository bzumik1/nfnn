import { BackupKeyWordCheck } from '../operations/backup-key/backup-key-word-check';
import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { BankAccountItem } from '../donations/bank-accounts-api';
import { DonationListResponse, DownloadedFile, downloadedFile } from '../donations/donations-api';
import { PasskeyConfirmation } from '../../core/auth/donor';
import {
  MailServerRequest,
  TestEmailResponse,
  SettingName,
  SettingsSavedResponse,
  SettingValueRequest,
} from '../operations/setup/setup-api';

export type ImportFailureKind =
  | 'RATE_LIMITED'
  | 'HISTORY_LOCKED'
  | 'UNAUTHORIZED'
  | 'TRANSPORT'
  | 'INVALID_RESPONSE'
  | 'UNEXPECTED';

export interface ImportFailure {
  kind: ImportFailureKind;
  message: string | null;
  attemptedAt: string | null;
}

export interface ImportStateResponse {
  coveredFrom: string | null;
  coveredTo: string | null;
  lastAttemptedAt: string | null;
  lastSucceededAt: string | null;
  lastFailure: ImportFailure | null;
  consecutiveFailures: number;
  reportedOutage: ImportFailureKind | null;
}

export type PairingFilter = 'unpaired' | 'paired';

export type PairingMethod = 'VARIABLE_SYMBOL' | 'SENDER_ACCOUNT' | 'CONFIRMED_SYMBOL' | 'MANUAL';

export interface PairedDonationResponse {
  id: string;
  donorId: string;
  donorName: string | null;
  pairedBy: PairingMethod;
  status: 'RECEIVED' | 'REFUNDED';
  recordedAt: string;
  receiptIssued: boolean;
}

export interface AdminPaymentResponse {
  id: string;
  bankTransactionId: number;
  bookedOn: string;
  amountMinor: number;
  currency: string;
  variableSymbol: string | null;
  counterpartyAccount: string | null;
  counterpartyName: string | null;
  messageForRecipient: string | null;
  importedAt: string;
  unpairedByAdminAt: string | null;
  accountVerification: boolean;
  donation: PairedDonationResponse | null;
}

export interface PaymentQuery {
  text?: string;
  from?: string;
  to?: string;
  donorId?: string;
  offset?: number;
  limit?: number;
}

export interface AdminPaymentListResponse {
  year: number | null;
  availableYears: number[];
  items: AdminPaymentResponse[];
  total: number;
}

export interface AdminDonorResponse {
  donorId: string;
  name: string;
  type: 'PERSON' | 'COMPANY';
  variableSymbol: string;
  companyIdentifier: string | null;
}

export interface AdminDonorSearchResponse {
  items: AdminDonorResponse[];
}

export interface PairPaymentResponse {
  donationId: string;
  changedYearlyReceipts: number[];
}

export interface UnpairPaymentResponse {
  changedYearlyReceipts: number[];
}

export interface AdministratorResponse {
  donorId: string;
  name: string;
  email: string;
  secondFactorEnabled: boolean;
}

export interface AdministratorListResponse {
  items: AdministratorResponse[];
}

export type SymbolClaimAnswer = 'CONFIRMED' | 'DECLINED';

export interface SymbolClaimResponse {
  id: string;
  donorId: string;
  donorName: string | null;
  account: string;
  variableSymbol: string;
  answer: SymbolClaimAnswer;
  answeredAt: string;
  donationCount: number;
}

export interface SymbolClaimListResponse {
  items: SymbolClaimResponse[];
}

export interface AdminActionResponse {
  id: string;
  adminId: string;
  adminName: string | null;
  adminEmail: string | null;
  action: string;
  subjectId: string | null;
  donorId: string | null;
  summary: string;
  details: string;
  performedAt: string;
  client: string | null;
}

export interface AdminActionListResponse {
  items: AdminActionResponse[];
  hasMore: boolean;
}

export interface AddressResponse {
  street: string;
  city: string;
  postalCode: string;
}

export interface DonorAccountResponse {
  donorId: string;
  type: 'PERSON' | 'COMPANY';
  name: string;
  companyIdentifier: string | null;
  address: AddressResponse;
  email: string;
  variableSymbol: string;
  preferredLocale: string;
  registeredAt: string;
  emailVerified: boolean;
  administrator: boolean;
  secondFactorEnabled: boolean;
  passkeys: number;
  erasedAt: string | null;
}

export interface DonorAccountListResponse {
  items: DonorAccountResponse[];
  hasMore: boolean;
}

export interface AdminDonorRecordResponse {
  donorId: string;
  name: string;
  type: 'PERSON' | 'COMPANY';
  variableSymbol: string;
  companyIdentifier: string | null;
  address: AddressResponse;
  preferredLocale: string;
  registeredAt: string;
  erasedAt: string | null;
}

export type ReceiptKind = 'SINGLE' | 'YEARLY';

export interface AdminReceiptResponse {
  id: string;
  number: string;
  kind: ReceiptKind;
  donationId: string | null;
  donationReceivedOn: string | null;
  year: number | null;
  issuedOn: string;
  issuedAt: string;
  locale: string;
  active: boolean;
}

export interface AdminDonorDetailResponse {
  donor: AdminDonorRecordResponse;
  bankAccounts: BankAccountItem[];
  donations: DonationListResponse;
  receipts: AdminReceiptResponse[];
}

export interface ReportSectionsResponse {
  donors: boolean;
  donations: boolean;
  unpairedPayments: boolean;
  bankImport: boolean;
}

export interface ReportSettingsResponse {
  recipients: string[];
  sendDay: number;
  sendHour: number;
  sections: ReportSectionsResponse;
  changedAt: string | null;
}

export interface ReportSettingsRequest {
  recipients: string[];
  sendDay: number;
  sendHour: number;
  sections: ReportSectionsResponse;
}

export interface SentReportResponse {
  month: string;
  sentAt: string;
}

export interface NextReportResponse {
  month: string;
  dueOn: string;
}

export interface AdminReportResponse {
  settings: ReportSettingsResponse;
  sentReports: SentReportResponse[];
  nextReport: NextReportResponse;
  lastEndedMonth: string;
}

export interface SendReportResponse {
  month: string;
  recipients: string[];
  sentAt: string;
}

export interface TallyResponse {
  count: number;
  totalMinor: number;
  currency: string;
}

export interface MonthOverviewResponse {
  month: string;
  received: TallyResponse;
  newDonors: number;
  givingDonors: number;
  paired: TallyResponse;
  unpaired: TallyResponse;
}

export interface AdminOverviewResponse {
  year: number;
  availableYears: number[];
  donorsRegistered: number;
  newDonors: number;
  givingDonors: number;
  received: TallyResponse;
  paired: TallyResponse;
  unpaired: TallyResponse;
  months: MonthOverviewResponse[];
}

export interface AdminActivitySinceResponse {
  from: string;
  payments: TallyResponse;
  paired: TallyResponse;
  unpaired: TallyResponse;
  newDonors: number;
}

export interface PreviousSignInResponse {
  previousSignInAt: string | null;
}

export type SettingGroup = 'SITE' | 'MAIL' | 'BANK' | 'RECEIPTS' | 'ADMINISTRATORS';

export interface AdminTestEmailRequest extends MailServerRequest {
  sender: string;
}

export interface AdminSettingResponse {
  name: SettingName;
  group: SettingGroup;
  secret: boolean;
  value: string | null;
  configured: boolean;
  stored: boolean;
  unreadable: boolean;
}

export interface AdminSettingsResponse {
  settings: AdminSettingResponse[];
  secretsCanBeStored: boolean;
}

export interface ReceiptSignatureResponse {
  configured: boolean;
  image: string | null;
  width: number | null;
  height: number | null;
  uploadedAt: string | null;
}

export type BackupKind = 'DAILY' | 'REQUESTED' | 'BEFORE_RESTORE' | 'OTHER';

export type RunOutcome = 'OK' | 'FAILED';

export type BackupRequestKind = 'BACKUP' | 'TEST_RESTORE';

export type RestoreFileState = 'PENDING' | 'DONE' | 'FAILED' | 'SKIPPED';

export type BackupProblem =
  | 'BACKUPS_UNAVAILABLE'
  | 'BACKUP_MISSING'
  | 'BACKUP_FAILED'
  | 'BACKUP_STALE'
  | 'TEST_RESTORE_MISSING'
  | 'TEST_RESTORE_FAILED'
  | 'TEST_RESTORE_STALE';

export interface BackupFileResponse {
  fileName: string;
  kind: BackupKind;
  sizeBytes: number;
  createdAt: string;
}

export interface BackupRunResponse {
  outcome: RunOutcome;
  startedAt: string;
  finishedAt: string;
  fileName: string | null;
  sizeBytes: number | null;
  tables: number | null;
  requestId: string | null;
  error: string | null;
}

export interface RestoreFileResponse {
  fileName: string;
  state: RestoreFileState;
  changedAt: string;
}

export interface AdminBackupsResponse {
  available: boolean;
  backups: BackupFileResponse[];
  lastBackup: BackupRunResponse | null;
  lastTestRestore: BackupRunResponse | null;
  lastRestore: BackupRunResponse | null;
  restoreFiles: RestoreFileResponse[];
  pendingRequests: number;
  restorePending: boolean;
  problems: BackupProblem[];
  schedule: BackupScheduleResponse;
  key: BackupKeyStatus;
}

export interface BackupKeyStatus {
  available: boolean;
  confirmed: boolean;
  confirmedAt: string | null;
}

export interface BackupKeyRevealRequest {
  secondFactorCode?: string;
  passkey?: PasskeyConfirmation;
}

export interface BackupKeyResponse {
  key: string;
  checkPositions: number[];
}

export interface BackupPlan {
  backupTime: string;
  testRestoreDay: number;
  testRestoreTime: string;
}

export interface BackupScheduleResponse extends BackupPlan {
  applied: BackupPlan | null;
}

export interface RestoreRequestResponse {
  requestId: string;
  fileName: string;
  requestedAt: string;
}

export interface BackupRequestResponse {
  requestId: string;
  kind: BackupRequestKind;
  requestedAt: string;
}

export interface LogFileResponse {
  name: string;
  sizeBytes: number;
  changedAt: string;
  compressed: boolean;
}

export interface LogFilesResponse {
  available: boolean;
  files: LogFileResponse[];
}

export interface LogWindowResponse {
  name: string;
  sizeBytes: number;
  from: number;
  to: number;
  hasOlder: boolean;
  hasNewer: boolean;
  text: string;
}

export interface LogMatchResponse {
  offset: number;
  line: string;
}

export interface LogSearchResponse {
  name: string;
  sizeBytes: number;
  matches: LogMatchResponse[];
  moreOlder: boolean;
  scannedFrom: number;
}

export type LogLevel = 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'OFF';

export interface LogOverrideResponse {
  logger: string;
  level: LogLevel;
  configuredBefore: LogLevel | null;
  since: string;
  until: string;
  adminId: string;
}

export interface LoggerResponse {
  logger: string;
  configuredLevel: LogLevel | null;
  effectiveLevel: LogLevel;
  override: LogOverrideResponse | null;
}

export interface LogLevelsResponse {
  loggers: LoggerResponse[];
}

export interface JvmDiagnosticsResponse {
  javaVersion: string;
  startedAt: string;
  heapUsedBytes: number;
  heapMaxBytes: number;
  nonHeapUsedBytes: number;
  liveThreads: number;
  peakThreads: number;
  daemonThreads: number;
  gcCount: number;
  gcTimeMillis: number;
  availableProcessors: number;
  systemLoadAverage: number;
}

export interface DatabaseDiagnosticsResponse {
  reachable: boolean;
  pingMillis: number;
  activeConnections: number;
  idleConnections: number;
  waitingThreads: number;
  maxConnections: number;
}

export interface DiskSpaceResponse {
  path: string;
  mounted: boolean;
  freeBytes: number;
  totalBytes: number;
}

export interface DiagnosticsResponse {
  now: string;
  jvm: JvmDiagnosticsResponse;
  database: DatabaseDiagnosticsResponse;
  disks: DiskSpaceResponse[];
  logLevelOverrides: LogOverrideResponse[];
}

@Injectable({ providedIn: 'root' })
export class AdminApi {
  private readonly http = inject(HttpClient);

  importState(): Observable<ImportStateResponse> {
    return this.http.get<ImportStateResponse>('/api/admin/donations/import-state');
  }

  payments(pairing: PairingFilter, query: PaymentQuery = {}): Observable<AdminPaymentListResponse> {
    const params: Record<string, string> = { pairing };
    const filters: [string, string | number | undefined][] = [
      ['query', query.text],
      ['from', query.from],
      ['to', query.to],
      ['donorId', query.donorId],
      ['offset', query.offset],
      ['limit', query.limit],
    ];
    for (const [name, value] of filters) {
      if (value !== undefined && value !== '' && !(name === 'offset' && value === 0)) {
        params[name] = String(value);
      }
    }
    return this.http.get<AdminPaymentListResponse>('/api/admin/donations/payments', { params });
  }

  searchDonors(query: string): Observable<AdminDonorSearchResponse> {
    return this.http.get<AdminDonorSearchResponse>('/api/admin/donations/donors', {
      params: { query },
    });
  }

  pairPayment(paymentId: string, donorId: string): Observable<PairPaymentResponse> {
    return this.http.post<PairPaymentResponse>(
      `/api/admin/donations/payments/${encodeURIComponent(paymentId)}/pair`,
      { donorId },
    );
  }

  unpairPayment(paymentId: string): Observable<UnpairPaymentResponse> {
    return this.http.post<UnpairPaymentResponse>(
      `/api/admin/donations/payments/${encodeURIComponent(paymentId)}/unpair`,
      null,
    );
  }

  administrators(): Observable<AdministratorListResponse> {
    return this.http.get<AdministratorListResponse>('/api/admin/donors/administrators');
  }

  grantAdministration(email: string): Observable<AdministratorResponse> {
    return this.http.post<AdministratorResponse>('/api/admin/donors/administrators', { email });
  }

  revokeAdministration(donorId: string): Observable<void> {
    return this.http.delete<void>(
      `/api/admin/donors/administrators/${encodeURIComponent(donorId)}`,
    );
  }

  resetSecondFactor(donorId: string): Observable<void> {
    return this.http.post<void>(
      `/api/admin/donors/${encodeURIComponent(donorId)}/second-factor/reset`,
      null,
    );
  }

  removePasskeys(donorId: string): Observable<void> {
    return this.http.delete<void>(`/api/admin/donors/${encodeURIComponent(donorId)}/passkeys`);
  }

  symbolClaims(): Observable<SymbolClaimListResponse> {
    return this.http.get<SymbolClaimListResponse>('/api/admin/donations/symbol-claims');
  }

  reverseSymbolClaim(claimId: string): Observable<void> {
    return this.http.post<void>(
      `/api/admin/donations/symbol-claims/${encodeURIComponent(claimId)}/reverse`,
      null,
    );
  }

  deleteSymbolClaim(claimId: string): Observable<void> {
    return this.http.delete<void>(
      `/api/admin/donations/symbol-claims/${encodeURIComponent(claimId)}`,
    );
  }

  adminActions(before: string | null = null, limit = 50): Observable<AdminActionListResponse> {
    const params: Record<string, string> = { limit: String(limit) };
    if (before !== null) {
      params['before'] = before;
    }
    return this.http.get<AdminActionListResponse>('/api/admin/donors/actions', { params });
  }

  donors(query: string, limit?: number): Observable<DonorAccountListResponse> {
    const params: Record<string, string | number> =
      limit === undefined ? { query } : { query, limit };
    return this.http.get<DonorAccountListResponse>('/api/admin/donors', { params });
  }

  donor(donorId: string): Observable<DonorAccountResponse> {
    return this.http.get<DonorAccountResponse>(`/api/admin/donors/${encodeURIComponent(donorId)}`);
  }

  eraseDonor(donorId: string): Observable<void> {
    return this.http.delete<void>(`/api/admin/donors/${encodeURIComponent(donorId)}`);
  }

  report(): Observable<AdminReportResponse> {
    return this.http.get<AdminReportResponse>('/api/admin/donations/report');
  }

  changeReportSettings(request: ReportSettingsRequest): Observable<ReportSettingsResponse> {
    return this.http.put<ReportSettingsResponse>('/api/admin/donations/report/settings', request);
  }

  sendReport(month: string): Observable<SendReportResponse> {
    return this.http.post<SendReportResponse>('/api/admin/donations/report/send', { month });
  }

  overview(year: number | null = null): Observable<AdminOverviewResponse> {
    const params: Record<string, string> = {};
    if (year !== null) {
      params['year'] = String(year);
    }
    return this.http.get<AdminOverviewResponse>('/api/admin/donations/overview', { params });
  }

  overviewSince(from: string): Observable<AdminActivitySinceResponse> {
    return this.http.get<AdminActivitySinceResponse>('/api/admin/donations/overview/since', {
      params: { from },
    });
  }

  previousSignIn(): Observable<PreviousSignInResponse> {
    return this.http.get<PreviousSignInResponse>('/api/admin/donors/me/previous-sign-in');
  }

  donorDonations(donorId: string): Observable<AdminDonorDetailResponse> {
    return this.http.get<AdminDonorDetailResponse>(
      `/api/admin/donations/donors/${encodeURIComponent(donorId)}`,
    );
  }

  disconnectDonorAccount(donorId: string, linkId: string): Observable<void> {
    return this.http.post<void>(`${donorAccountUrl(donorId, linkId)}/disconnect`, null);
  }

  reconnectDonorAccount(donorId: string, linkId: string): Observable<void> {
    return this.http.post<void>(`${donorAccountUrl(donorId, linkId)}/reconnect`, null);
  }

  removeDonorAccount(donorId: string, linkId: string): Observable<void> {
    return this.http.delete<void>(donorAccountUrl(donorId, linkId));
  }

  backups(): Observable<AdminBackupsResponse> {
    return this.http.get<AdminBackupsResponse>('/api/admin/operations/backups');
  }

  changeBackupSchedule(plan: BackupPlan): Observable<BackupScheduleResponse> {
    return this.http.put<BackupScheduleResponse>('/api/admin/operations/backups/schedule', plan);
  }

  revealBackupKey(request: BackupKeyRevealRequest): Observable<BackupKeyResponse> {
    return this.http.post<BackupKeyResponse>('/api/admin/operations/backups/key/reveal', request);
  }

  confirmBackupKey(words: BackupKeyWordCheck[]): Observable<BackupKeyStatus> {
    return this.http.post<BackupKeyStatus>('/api/admin/operations/backups/key/confirmation', {
      words,
    });
  }

  requestBackup(kind: BackupRequestKind): Observable<BackupRequestResponse> {
    return this.http.post<BackupRequestResponse>('/api/admin/operations/backups/requests', {
      kind,
    });
  }

  restoreBackup(fileName: string): Observable<RestoreRequestResponse> {
    return this.http.post<RestoreRequestResponse>(
      `/api/admin/operations/backups/${encodeURIComponent(fileName)}/restore`,
      null,
    );
  }

  downloadBackup(fileName: string): Observable<DownloadedFile> {
    return this.http
      .get(`/api/admin/operations/backups/${encodeURIComponent(fileName)}`, {
        responseType: 'blob',
        observe: 'response',
      })
      .pipe(map((response) => downloadedFile(response, fileName)));
  }

  settings(): Observable<AdminSettingsResponse> {
    return this.http.get<AdminSettingsResponse>('/api/admin/operations/settings');
  }

  changeSettings(changes: SettingValueRequest[]): Observable<SettingsSavedResponse> {
    return this.http.put<SettingsSavedResponse>('/api/admin/operations/settings', { changes });
  }

  receiptSignature(): Observable<ReceiptSignatureResponse> {
    return this.http.get<ReceiptSignatureResponse>(RECEIPT_SIGNATURE_URL);
  }

  uploadReceiptSignature(file: File): Observable<ReceiptSignatureResponse> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<ReceiptSignatureResponse>(RECEIPT_SIGNATURE_URL, form);
  }

  removeReceiptSignature(): Observable<void> {
    return this.http.delete<void>(RECEIPT_SIGNATURE_URL);
  }

  sendTestEmail(request: AdminTestEmailRequest): Observable<TestEmailResponse> {
    return this.http.post<TestEmailResponse>('/api/admin/operations/settings/test-email', request);
  }

  logFiles(): Observable<LogFilesResponse> {
    return this.http.get<LogFilesResponse>(LOGS_URL);
  }

  logWindow(name: string, from: number | null, bytes: number): Observable<LogWindowResponse> {
    const params: Record<string, string> = { bytes: String(bytes) };
    if (from !== null) {
      params['from'] = String(from);
    }
    return this.http.get<LogWindowResponse>(`${LOGS_URL}/${encodeURIComponent(name)}`, {
      params,
    });
  }

  searchLog(
    name: string,
    pattern: string,
    before: number | null,
    limit: number,
  ): Observable<LogSearchResponse> {
    const params: Record<string, string> = { pattern, limit: String(limit) };
    if (before !== null) {
      params['before'] = String(before);
    }
    return this.http.get<LogSearchResponse>(`${LOGS_URL}/${encodeURIComponent(name)}/search`, {
      params,
    });
  }

  logLevels(): Observable<LogLevelsResponse> {
    return this.http.get<LogLevelsResponse>(LOGGERS_URL);
  }

  setLogLevel(logger: string, level: LogLevel, minutes: number): Observable<LogOverrideResponse> {
    return this.http.put<LogOverrideResponse>(`${LOGGERS_URL}/${encodeURIComponent(logger)}`, {
      level,
      minutes,
    });
  }

  resetLogLevel(logger: string): Observable<void> {
    return this.http.delete<void>(`${LOGGERS_URL}/${encodeURIComponent(logger)}`);
  }

  diagnostics(): Observable<DiagnosticsResponse> {
    return this.http.get<DiagnosticsResponse>(DIAGNOSTICS_URL);
  }

  threadDump(): Observable<string> {
    return this.http.get(`${DIAGNOSTICS_URL}/threads`, { responseType: 'text' });
  }
}

const LOGS_URL = '/api/admin/operations/logs';
const RECEIPT_SIGNATURE_URL = '/api/admin/donations/receipt-signature';
const LOGGERS_URL = '/api/admin/operations/loggers';
const DIAGNOSTICS_URL = '/api/admin/operations/diagnostics';

function donorAccountUrl(donorId: string, linkId: string): string {
  return `/api/admin/donations/donors/${encodeURIComponent(donorId)}/bank-accounts/${encodeURIComponent(linkId)}`;
}
