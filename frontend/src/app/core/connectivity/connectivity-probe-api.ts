import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { WITHOUT_ACCESS_TOKEN } from '../auth/auth-interceptor';

export const PROBE_PATH = '/api/operations/setup';

@Injectable({ providedIn: 'root' })
export class ConnectivityProbeApi {
  private readonly http = inject(HttpClient);

  probe(): Observable<void> {
    return this.http
      .get(PROBE_PATH, { context: new HttpContext().set(WITHOUT_ACCESS_TOKEN, true) })
      .pipe(map(() => undefined));
  }
}
