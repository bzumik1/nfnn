import { HttpClient } from '@angular/common/http';
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
  | 'ADMIN_EMAILS';

export type RestartOutcome = 'restarted' | 'slow';

export const RESTART_POLL_MS = 3000;
const RESTART_MAX_POLLS = 100;
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

export interface SetupStatusResponse {
  required: boolean;
  codeRequired: boolean;
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

  watchRestart(): Observable<RestartOutcome> {
    return timer(RESTART_POLL_MS, RESTART_POLL_MS).pipe(
      take(RESTART_MAX_POLLS),
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
