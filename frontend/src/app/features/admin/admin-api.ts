import { BackupKeyWordCheck } from '../operations/backup-key/backup-key-word-check';
import { ifMatch } from '../../core/version/row-version';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { BankAccountItem } from '../donations/bank-accounts-api';
import { DonationListResponse, DownloadedFile, downloadedFile } from '../donations/donations-api';
import { PasskeyConfirmation } from '../../core/auth/donor';
import { IssuedReceipt } from '../donations/receipt-pdf/frozen-receipt';
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

export type PushAlertArea = 'bankImport' | 'backups' | 'mail';

export type PushAlertSwitches = Record<PushAlertArea, boolean>;

export type PushService = 'google' | 'apple' | 'mozilla' | 'microsoft';

export interface PushSubscriptionResponse {
  id: string;
  service: PushService;
  alerts: PushAlertSwitches;
  createdAt: string;
  lastDeliveredAt: string | null;
  failuresInARow: number;
  current: boolean;
}

export interface OpenAlertResponse {
  area: PushAlertArea;
  since: string;
}

export interface AdminPushResponse {
  publicKey: string;
  deviceSession?: boolean;
  subscriptions: PushSubscriptionResponse[];
  openAlerts?: OpenAlertResponse[];
}

export interface PushSubscriptionRequest {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  alerts?: PushAlertSwitches;
}

export interface PushTestResponse {
  delivered: number;
  failed: number;
  removed: number;
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
  version: string;
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
  year?: number;
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
  version: string;
  donorId: string;
  donorName: string | null;
  account: string;
  variableSymbol: string;
  answer: SymbolClaimAnswer;
  answeredAt: string;
  donationCount: number;
}

export type BankLogoFailure =
  | 'status'
  | 'redirected'
  | 'timeout'
  | 'unreachable'
  | 'unknown-host'
  | 'non-public-address'
  | 'too-large'
  | 'unsupported-type'
  | 'image-too-large'
  | 'unreadable-image'
  | 'interrupted';

export interface AdminBankLogoResponse {
  code: string;
  bankName: string | null;
  sourceUrl: string;
  sourceAllowed: boolean;
  version: string;
  imageId: string | null;
  imageSha256: string | null;
  fetchedAt: string | null;
  checkedAt: string | null;
  lastFailure: BankLogoFailure | null;
}

export interface AdminBankLogoListResponse {
  items: AdminBankLogoResponse[];
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

export type ReceiptWithdrawalReason = 'DONATIONS_CHANGED';

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
  withdrawnAt: string | null;
  withdrawalReason: ReceiptWithdrawalReason | null;
  keyId: string;
}

export interface AdminBankAccountItem extends BankAccountItem {
  version: string;
}

export interface AdminDonorDetailResponse {
  donor: AdminDonorRecordResponse;
  bankAccounts: AdminBankAccountItem[];
  donations: DonationListResponse;
  receipts: AdminReceiptResponse[];
  yearlyReceiptsAvailableThrough: number;
  receiptsAvailableFrom: number;
}

export type ReceiptIssueRequest = { year: number } | { donationId: string };

export type IssuedReceiptStatus = 'ACTIVE' | 'REPLACED' | 'WITHDRAWN';

export interface AdminFrozenReceiptResponse {
  number: string;
  issuedOn: string;
  replaces: { number: string; issuedOn: string } | null;
  verification: { keyId: string; qrText: string };
}

export interface AdminIssuedReceiptResponse {
  id: string;
  donorId: string;
  status: IssuedReceiptStatus;
  kind: ReceiptKind;
  number: string;
  donationId: string | null;
  year: number | null;
  issuedAt: string;
  supersededAt: string | null;
  withdrawnAt: string | null;
  withdrawalReason: ReceiptWithdrawalReason | null;
  donorErased: boolean;
  receipt: AdminFrozenReceiptResponse;
}

export interface YearlyReceiptCandidateReceipt {
  id: string;
  number: string;
  issuedAt: string;
}

export interface YearlyReceiptCandidate {
  donorId: string;
  name: string;
  type: 'PERSON' | 'COMPANY';
  giftCount: number;
  totalAmountMinor: number;
  receipt: YearlyReceiptCandidateReceipt | null;
}

export interface YearlyReceiptCandidatesResponse {
  year: number;
  donors: YearlyReceiptCandidate[];
  erasedDonors: number;
  yearlyReceiptsAvailableThrough: number;
  receiptsAvailableFrom: number;
}

export type YearlyReceiptOutcome = 'ISSUED' | 'UNCHANGED' | 'REPLACED' | 'SKIPPED';

export interface YearlyIssuedReceipt extends IssuedReceipt {
  donorId: string;
  withdrawnAt: string | null;
  withdrawalReason: ReceiptWithdrawalReason | null;
  donorErased: boolean;
}

export interface YearlyReceiptResult {
  donorId: string;
  outcome: YearlyReceiptOutcome;
  problem: string | null;
  replacedNumber: string | null;
  receipt: YearlyIssuedReceipt | null;
}

export interface YearlyReceiptsIssueResponse {
  year: number;
  results: YearlyReceiptResult[];
  issued: number;
  replaced: number;
  unchanged: number;
  skipped: number;
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
  version: string;
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

export interface ReportDonorsResponse {
  registered: number;
  newInMonth: number;
}

export interface ReportDonationsResponse {
  received: TallyResponse;
  paired: TallyResponse;
  receivedInYear: TallyResponse;
}

export interface ReportBankImportResponse {
  lastSucceededAt: string | null;
  lastFailure: { kind: ImportFailureKind; attemptedAt: string } | null;
}

export interface ReportContentResponse {
  donors: ReportDonorsResponse | null;
  donations: ReportDonationsResponse | null;
  unpairedPayments: TallyResponse | null;
  bankImport: ReportBankImportResponse | null;
}

export interface ReportDeliveryResponse {
  sentAt: string;
  byHand: boolean;
  recipientCount: number;
  content: ReportContentResponse;
}

export interface SentReportDetailResponse {
  month: string;
  firstSentAt: string;
  deliveries: ReportDeliveryResponse[];
  recomputed: ReportContentResponse | null;
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

export type ReceiptSignatureKind = 'RASTER' | 'VECTOR';

export interface SignatureVectorPath {
  d: string;
  fill: string;
  opacity: number;
}

export interface SignatureVectorResponse {
  viewBox: number[];
  paths: SignatureVectorPath[];
}

export interface ReceiptSignatureResponse {
  configured: boolean;
  kind: ReceiptSignatureKind | null;
  image: string | null;
  vector: SignatureVectorResponse | null;
  width: number | null;
  height: number | null;
  uploadedAt: string | null;
}

export interface ChosenReceiptSignatoryResponse {
  personId: string;
  name: string;
  receiptRole: string;
  chosenAt: string;
  portrait: boolean;
  portraitPrintable: boolean;
  signature: boolean;
}

export interface ReceiptSignatureSummaryResponse {
  personId: string;
  kind: ReceiptSignatureKind;
  width: number;
  height: number;
  uploadedAt: string;
}

export interface ReceiptSignatoryResponse {
  signatory: ChosenReceiptSignatoryResponse | null;
  signatures: ReceiptSignatureSummaryResponse[];
}

export interface ReceiptSignatoryRequest {
  personId: string;
  receiptRole: string;
}

export const MAX_RECEIPT_ROLE_LENGTH = 120;

export type ReceiptSigningKeyStatus = 'active' | 'revoked';

export interface ReceiptSigningKeyResponse {
  keyId: string;
  algorithm: 'Ed25519';
  publicKey: string;
  status: ReceiptSigningKeyStatus;
  registeredAt: string;
  published: boolean;
  current: boolean;
}

export type ReceiptSigningKeyMismatchKind = 'missing' | 'reverted';

export interface ReceiptSigningKeyMismatch {
  keyId: string;
  kind: ReceiptSigningKeyMismatchKind;
}

export interface ReceiptSigningKeysResponse {
  currentKeyId: string;
  currentKeyPublished: boolean;
  keys: ReceiptSigningKeyResponse[];
  auditMismatches: ReceiptSigningKeyMismatch[];
}

export interface ReceiptSigningKeyWithdrawalResponse extends ReceiptSigningKeysResponse {
  restarting: boolean;
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

export interface FreshSecondFactorRequest {
  secondFactorCode?: string;
  passkey?: PasskeyConfirmation;
}

export type BackupKeyRevealRequest = FreshSecondFactorRequest;

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

const YEARLY_RECEIPTS = '/api/admin/donations/receipts/yearly';

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
      ['year', query.year],
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

  pairPayment(
    paymentId: string,
    donorId: string,
    version: string,
  ): Observable<PairPaymentResponse> {
    return this.http.post<PairPaymentResponse>(
      `/api/admin/donations/payments/${encodeURIComponent(paymentId)}/pair`,
      { donorId },
      ifMatch(version),
    );
  }

  unpairPayment(paymentId: string, version: string): Observable<UnpairPaymentResponse> {
    return this.http.post<UnpairPaymentResponse>(
      `/api/admin/donations/payments/${encodeURIComponent(paymentId)}/unpair`,
      null,
      ifMatch(version),
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

  bankLogos(): Observable<AdminBankLogoListResponse> {
    return this.http.get<AdminBankLogoListResponse>(BANK_LOGOS_URL);
  }

  setBankLogoSource(
    code: string,
    sourceUrl: string,
    version: string | null,
  ): Observable<AdminBankLogoResponse> {
    return this.http.put<AdminBankLogoResponse>(
      bankLogoUrl(code),
      { sourceUrl },
      version === null ? { headers: new HttpHeaders({ 'If-None-Match': '*' }) } : ifMatch(version),
    );
  }

  refreshBankLogo(code: string): Observable<AdminBankLogoResponse> {
    return this.http.post<AdminBankLogoResponse>(`${bankLogoUrl(code)}/refresh`, null);
  }

  removeBankLogo(code: string, version: string): Observable<void> {
    return this.http.delete<void>(bankLogoUrl(code), ifMatch(version));
  }

  symbolClaims(): Observable<SymbolClaimListResponse> {
    return this.http.get<SymbolClaimListResponse>('/api/admin/donations/symbol-claims');
  }

  reverseSymbolClaim(claimId: string, version: string): Observable<void> {
    return this.http.post<void>(
      `/api/admin/donations/symbol-claims/${encodeURIComponent(claimId)}/reverse`,
      null,
      ifMatch(version),
    );
  }

  deleteSymbolClaim(claimId: string, version: string): Observable<void> {
    return this.http.delete<void>(
      `/api/admin/donations/symbol-claims/${encodeURIComponent(claimId)}`,
      ifMatch(version),
    );
  }

  adminActions(
    after: Pick<AdminActionResponse, 'id' | 'performedAt'> | null = null,
    limit = 50,
  ): Observable<AdminActionListResponse> {
    const params: Record<string, string> = { limit: String(limit) };
    if (after !== null) {
      params['before'] = after.performedAt;
      params['beforeId'] = after.id;
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

  changeReportSettings(
    request: ReportSettingsRequest,
    version: string,
  ): Observable<ReportSettingsResponse> {
    return this.http.put<ReportSettingsResponse>(
      '/api/admin/donations/report/settings',
      request,
      ifMatch(version),
    );
  }

  sentReport(month: string): Observable<SentReportDetailResponse> {
    return this.http.get<SentReportDetailResponse>('/api/admin/donations/report/sent', {
      params: { month },
    });
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

  issueReceipt(
    donorId: string,
    request: ReceiptIssueRequest,
  ): Observable<AdminIssuedReceiptResponse> {
    return this.http.post<AdminIssuedReceiptResponse>(
      `/api/admin/donations/donors/${encodeURIComponent(donorId)}/receipts`,
      request,
    );
  }

  yearlyReceiptCandidates(year: number | null): Observable<YearlyReceiptCandidatesResponse> {
    const params: Record<string, string> = year === null ? {} : { year: String(year) };
    return this.http.get<YearlyReceiptCandidatesResponse>(YEARLY_RECEIPTS, { params });
  }

  issueYearlyReceipts(
    year: number,
    donorIds: readonly string[],
  ): Observable<YearlyReceiptsIssueResponse> {
    return this.http.post<YearlyReceiptsIssueResponse>(YEARLY_RECEIPTS, { year, donorIds });
  }

  disconnectDonorAccount(donorId: string, linkId: string, version: string): Observable<void> {
    return this.http.post<void>(
      `${donorAccountUrl(donorId, linkId)}/disconnect`,
      null,
      ifMatch(version),
    );
  }

  reconnectDonorAccount(donorId: string, linkId: string, version: string): Observable<void> {
    return this.http.post<void>(
      `${donorAccountUrl(donorId, linkId)}/reconnect`,
      null,
      ifMatch(version),
    );
  }

  removeDonorAccount(donorId: string, linkId: string, version: string): Observable<void> {
    return this.http.delete<void>(donorAccountUrl(donorId, linkId), ifMatch(version));
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

  receiptSignatory(): Observable<ReceiptSignatoryResponse> {
    return this.http.get<ReceiptSignatoryResponse>(RECEIPT_SIGNATORY_URL);
  }

  chooseReceiptSignatory(
    request: ReceiptSignatoryRequest,
  ): Observable<ChosenReceiptSignatoryResponse> {
    return this.http.put<ChosenReceiptSignatoryResponse>(RECEIPT_SIGNATORY_URL, request);
  }

  receiptSignature(personId: string): Observable<ReceiptSignatureResponse> {
    return this.http.get<ReceiptSignatureResponse>(receiptSignatureUrl(personId));
  }

  uploadReceiptSignature(personId: string, file: File): Observable<ReceiptSignatureResponse> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<ReceiptSignatureResponse>(receiptSignatureUrl(personId), form);
  }

  receiptSigningKeys(): Observable<ReceiptSigningKeysResponse> {
    return this.http.get<ReceiptSigningKeysResponse>(RECEIPT_SIGNING_KEYS_URL);
  }

  withdrawReceiptSigningKey(
    keyId: string,
    proof: FreshSecondFactorRequest,
  ): Observable<ReceiptSigningKeyWithdrawalResponse> {
    return this.http.post<ReceiptSigningKeyWithdrawalResponse>(
      `${RECEIPT_SIGNING_KEYS_URL}/${encodeURIComponent(keyId)}/withdrawal`,
      proof,
    );
  }

  removeReceiptSignature(personId: string): Observable<void> {
    return this.http.delete<void>(receiptSignatureUrl(personId));
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

  push(): Observable<AdminPushResponse> {
    return this.http.get<AdminPushResponse>(PUSH_URL);
  }

  subscribePush(request: PushSubscriptionRequest): Observable<PushSubscriptionResponse> {
    return this.http.post<PushSubscriptionResponse>(`${PUSH_URL}/subscriptions`, request);
  }

  changePushAlerts(id: string, alerts: PushAlertSwitches): Observable<PushSubscriptionResponse> {
    return this.http.put<PushSubscriptionResponse>(
      `${PUSH_URL}/subscriptions/${encodeURIComponent(id)}/alerts`,
      alerts,
    );
  }

  removePushSubscription(id: string): Observable<void> {
    return this.http.delete<void>(`${PUSH_URL}/subscriptions/${encodeURIComponent(id)}`);
  }

  testPush(): Observable<PushTestResponse> {
    return this.http.post<PushTestResponse>(`${PUSH_URL}/test`, null);
  }

  diagnostics(): Observable<DiagnosticsResponse> {
    return this.http.get<DiagnosticsResponse>(DIAGNOSTICS_URL);
  }

  threadDump(): Observable<string> {
    return this.http.get(`${DIAGNOSTICS_URL}/threads`, { responseType: 'text' });
  }
}

const LOGS_URL = '/api/admin/operations/logs';
const PUSH_URL = '/api/admin/operations/push';
const RECEIPT_SIGNATORY_URL = '/api/admin/donations/receipt-signatory';

function receiptSignatureUrl(personId: string): string {
  return `/api/admin/donations/receipt-signatures/${encodeURIComponent(personId)}`;
}
const RECEIPT_SIGNING_KEYS_URL = '/api/admin/donations/receipt-signing-keys';
const LOGGERS_URL = '/api/admin/operations/loggers';
const DIAGNOSTICS_URL = '/api/admin/operations/diagnostics';

function donorAccountUrl(donorId: string, linkId: string): string {
  return `/api/admin/donations/donors/${encodeURIComponent(donorId)}/bank-accounts/${encodeURIComponent(linkId)}`;
}

const BANK_LOGOS_URL = '/api/admin/donations/bank-logos';

function bankLogoUrl(code: string): string {
  return `${BANK_LOGOS_URL}/${encodeURIComponent(code)}`;
}
