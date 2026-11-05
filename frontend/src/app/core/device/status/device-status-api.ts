import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { WITHOUT_ACCESS_TOKEN } from '../../auth/auth-interceptor';

export type DeviceStatus = 'signed-in' | 'signed-out' | 'wipe-admin' | 'wipe-all' | 'unknown';

export interface DeviceStatusResponse {
  readonly status: DeviceStatus;
  readonly administrator: boolean;
}

@Injectable({ providedIn: 'root' })
export class DeviceStatusApi {
  private readonly http = inject(HttpClient);

  status(deviceSecret: string): Observable<DeviceStatusResponse> {
    return this.http.post<DeviceStatusResponse>(
      '/api/donors/devices/status',
      { deviceSecret },
      { context: new HttpContext().set(WITHOUT_ACCESS_TOKEN, true) },
    );
  }
}
