import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

export type OpenAlertArea = 'bankImport' | 'backups' | 'mail';

export interface OpenAlert {
  readonly area: OpenAlertArea;
  readonly since: string;
}

interface PushSettingsAnswer {
  readonly openAlerts?: readonly OpenAlert[];
}

@Injectable({ providedIn: 'root' })
export class OpenAlertsApi {
  private readonly http = inject(HttpClient);

  openAlerts(): Observable<readonly OpenAlert[]> {
    return this.http
      .get<PushSettingsAnswer>('/api/admin/operations/push')
      .pipe(map((answer) => answer.openAlerts ?? []));
  }
}
