import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { BankAccountItem } from '../donations/bank-accounts-api';
import { DonationListResponse, DownloadedFile, downloadedFile } from '../donations/donations-api';
import {
  MailServerRequest,
  MailTestResponse,
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
  donation: PairedDonationResponse | null;
}

export interface AdminPaymentListResponse {
  year: number | null;
  availableYears: number[];
  items: AdminPaymentResponse[];
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
  details: string;
  performedAt: string;
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
  erasedAt: string | null;
}

export interface DonorAccountListResponse {
  items: DonorAccountResponse[];
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
  sections: ReportSectionsResponse;
  changedAt: string | null;
}

export interface ReportSettingsRequest {
  recipients: string[];
  sendDay: number;
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
  paired: TallyResponse;
  unpaired: TallyResponse;
}

export interface AdminOverviewResponse {
  year: number;
  availableYears: number[];
  donorsRegistered: number;
  newDonors: number;
  received: TallyResponse;
  paired: TallyResponse;
  unpaired: TallyResponse;
  months: MonthOverviewResponse[];
}

export type SettingGroup = 'SITE' | 'MAIL' | 'BANK' | 'RECEIPTS' | 'ADMINISTRATORS' | 'TUNNEL';

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
  problems: BackupProblem[];
}

export interface BackupRequestResponse {
  requestId: string;
  kind: BackupRequestKind;
  requestedAt: string;
}

@Injectable({ providedIn: 'root' })
export class AdminApi {
  private readonly http = inject(HttpClient);

  importState(): Observable<ImportStateResponse> {
    return this.http.get<ImportStateResponse>('/api/admin/donations/import-state');
  }

  payments(
    pairing: PairingFilter,
    year: number | null = null,
  ): Observable<AdminPaymentListResponse> {
    const params: Record<string, string> = { pairing };
    if (year !== null) {
      params['year'] = String(year);
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

  donors(query: string): Observable<DonorAccountListResponse> {
    return this.http.get<DonorAccountListResponse>('/api/admin/donors', { params: { query } });
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

  requestBackup(kind: BackupRequestKind): Observable<BackupRequestResponse> {
    return this.http.post<BackupRequestResponse>('/api/admin/operations/backups/requests', {
      kind,
    });
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

  testMailServer(server: MailServerRequest): Observable<MailTestResponse> {
    return this.http.post<MailTestResponse>('/api/admin/operations/settings/mail-test', server);
  }
}

function donorAccountUrl(donorId: string, linkId: string): string {
  return `/api/admin/donations/donors/${encodeURIComponent(donorId)}/bank-accounts/${encodeURIComponent(linkId)}`;
}
