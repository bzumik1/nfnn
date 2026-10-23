import { HttpClient, HttpEvent, HttpHeaders } from '@angular/common/http';
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
  | 'RECEIPT_SIGNATORY_NAME'
  | 'RECEIPT_SIGNATORY_ROLE'
  | 'RECEIPT_FIRST_YEAR'
  | 'ADMIN_EMAILS'
  | 'OAUTH_CLIENT_HOSTS';

export type RestartOutcome = 'restarted' | 'slow';

export const RESTART_POLL_MS = 3000;
const RESTART_MAX_POLLS = 100;
export const RESTORE_MAX_POLLS = 300;
export const SETUP_CODE_HEADER = 'X-Nfnn-Setup-Code';
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
}

export interface MailServerRequest {
  host: string;
  port: number;
  username: string;
  password: string;
  auth: boolean;
  startTls: boolean;
}

export interface MailTestResponse {
  ok: boolean;
}

export interface SettingsSavedResponse {
  changed: SettingName[];
  restarting: boolean;
}

@Injectable({ providedIn: 'root' })
export class SetupApi {
  private readonly http = inject(HttpClient);

  status(): Observable<SetupStatusResponse> {
    return this.http.get<SetupStatusResponse>('/api/operations/setup');
  }

  unlock(code: string): Observable<void> {
    return this.http.post<void>('/api/operations/setup/unlock', { code });
  }

  testMail(code: string | null, server: MailServerRequest): Observable<MailTestResponse> {
    return this.http.post<MailTestResponse>('/api/operations/setup/mail-test', {
      code,
      ...server,
    });
  }

  complete(request: SetupRequest): Observable<SettingsSavedResponse> {
    return this.http.post<SettingsSavedResponse>('/api/operations/setup', request);
  }

  uploadBackup(code: string | null, file: Blob): Observable<HttpEvent<RestoreRequestResponse>> {
    let headers = new HttpHeaders({ 'Content-Type': 'application/octet-stream' });
    if (code) {
      headers = headers.set(SETUP_CODE_HEADER, code);
    }
    return this.http.put<RestoreRequestResponse>('/api/operations/setup/restore', file, {
      headers,
      reportProgress: true,
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
      map((): RestartOutcome => 'restarted'),
      defaultIfEmpty<RestartOutcome, RestartOutcome>('slow'),
    );
  }
}
