import { BackupKeyWordCheck } from '../backup-key/backup-key-word-check';
import { HttpClient, HttpContext, HttpEvent, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  catchError,
  concatMap,
  defaultIfEmpty,
  filter,
  map,
  Observable,
  of,
  scan,
  take,
  timer,
} from 'rxjs';
import { WITHOUT_ACCESS_TOKEN } from '../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../core/auth/auth-store';

export type SettingName =
  | 'PUBLIC_URL'
  | 'MAIL_HOST'
  | 'MAIL_PORT'
  | 'MAIL_USERNAME'
  | 'MAIL_PASSWORD'
  | 'MAIL_AUTH'
  | 'MAIL_STARTTLS'
  | 'MAIL_FROM'
  | 'CONTACT_RECIPIENT'
  | 'FIO_TOKEN'
  | 'FIO_HISTORY_FROM'
  | 'PAIRING_EXCLUDED_ACCOUNTS'
  | 'RECEIPT_FIRST_YEAR'
  | 'ADMIN_EMAILS';

export type RestartOutcome = 'restarted' | 'slow';

export const RESTART_POLL_MS = 3000;
const RESTART_MAX_POLLS = 100;
export const RESTORE_MAX_POLLS = 300;
export const SETUP_CODE_HEADER = 'X-Nfnn-Setup-Code';
export const BACKUP_KEY_HEADER = 'X-Nfnn-Backup-Key';
const RESTART_GRACE_POLLS = 10;

interface RestartProbe {
  index: number;
  up: boolean;
  wentDown: boolean;
}

export interface SettingValueRequest {
  name: SettingName;
  value: string;
}

export type RestoreOutcome = 'OK' | 'FAILED';

export interface LastRestoreResponse {
  requestId: string | null;
  outcome: RestoreOutcome;
  finishedAt: string;
  error: string | null;
}

export interface SetupStatusResponse {
  required: boolean;
  codeRequired: boolean;
  lastRestore: LastRestoreResponse | null;
}

export interface RestoreRequestResponse {
  requestId: string;
  fileName: string;
  requestedAt: string;
}

export interface SetupRequest {
  code: string | null;
  settings: SettingValueRequest[];
  backupKeyWords: BackupKeyWordCheck[] | null;
}

export interface BackupKeyResponse {
  key: string;
  checkPositions: number[];
}

export interface MailServerRequest {
  host: string;
  port: number;
  username: string;
  password: string;
  auth: boolean;
  startTls: boolean;
}

export interface SetupTestEmailRequest extends MailServerRequest {
  sender: string;
  recipient: string;
}

export type TestEmailOutcome =
  | 'SENT'
  | 'UNREACHABLE'
  | 'TIMEOUT'
  | 'STARTTLS_UNAVAILABLE'
  | 'SIGN_IN_REFUSED'
  | 'SENDER_REFUSED'
  | 'RECIPIENT_REFUSED'
  | 'FAILED';

export interface TestEmailResponse {
  outcome: TestEmailOutcome;
  sent: boolean;
  recipient: string;
}

export interface SettingsSavedResponse {
  changed: SettingName[];
  restarting: boolean;
}

@Injectable({ providedIn: 'root' })
export class SetupApi {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthStore);

  status(): Observable<SetupStatusResponse> {
    return this.http.get<SetupStatusResponse>('/api/operations/setup', {
      context: new HttpContext().set(WITHOUT_ACCESS_TOKEN, true),
    });
  }

  unlock(code: string): Observable<void> {
    return this.http.post<void>('/api/operations/setup/unlock', { code });
  }

  sendTestEmail(
    code: string | null,
    request: SetupTestEmailRequest,
  ): Observable<TestEmailResponse> {
    return this.http.post<TestEmailResponse>('/api/operations/setup/test-email', {
      code,
      ...request,
    });
  }

  backupKey(code: string | null): Observable<BackupKeyResponse> {
    return this.http.get<BackupKeyResponse>('/api/operations/setup/backup-key', {
      headers: code ? new HttpHeaders({ [SETUP_CODE_HEADER]: code }) : undefined,
    });
  }

  complete(request: SetupRequest): Observable<SettingsSavedResponse> {
    return this.http.post<SettingsSavedResponse>('/api/operations/setup', request);
  }

  uploadBackup(
    code: string | null,
    file: Blob,
    backupKey: string | null = null,
  ): Observable<HttpEvent<RestoreRequestResponse>> {
    let headers = new HttpHeaders({ 'Content-Type': 'application/octet-stream' });
    if (code) {
      headers = headers.set(SETUP_CODE_HEADER, code);
    }
    if (backupKey) {
      headers = headers.set(BACKUP_KEY_HEADER, backupKey);
    }
    return this.http.put<RestoreRequestResponse>('/api/operations/setup/restore', file, {
      headers,
      reportUploadProgress: true,
      observe: 'events',
    });
  }

  watchRestart(maxPolls = RESTART_MAX_POLLS): Observable<RestartOutcome> {
    return timer(RESTART_POLL_MS, RESTART_POLL_MS).pipe(
      take(maxPolls),
      concatMap((index) =>
        this.status().pipe(
          map(() => ({ index, up: true })),
          catchError(() => of({ index, up: false })),
        ),
      ),
      scan<{ index: number; up: boolean }, RestartProbe>(
        (state, probe) => ({ ...probe, wentDown: state.wentDown || !probe.up }),
        { index: -1, up: false, wentDown: false },
      ),
      filter((probe) => probe.up && (probe.wentDown || probe.index >= RESTART_GRACE_POLLS)),
      take(1),
      concatMap(() => this.renewedSession()),
      map((): RestartOutcome => 'restarted'),
      defaultIfEmpty<RestartOutcome, RestartOutcome>('slow'),
    );
  }

  private renewedSession(): Observable<unknown> {
    if (this.auth.currentAccessToken() === null) {
      return of(null);
    }
    return this.auth.refresh().pipe(catchError(() => of(null)));
  }
}
