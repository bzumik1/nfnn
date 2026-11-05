import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { ExternalNavigation } from '../../../core/navigation/external-navigation';
import { SPAYD_MEDIA_TYPE } from './bank-handoff';

const PAYMENT_ROUTE = '/platba.spayd';
const PROBE_TIMEOUT_MS = 2_000;

@Injectable({ providedIn: 'root' })
export class LocalPaymentRoute {
  private readonly http = inject(HttpClient);
  private readonly document = inject(DOCUMENT);
  private readonly navigation = inject(ExternalNavigation);

  async open(spaydText: string): Promise<boolean> {
    if (!(await this.answered())) {
      return false;
    }
    this.navigation.assign(`${PAYMENT_ROUTE}?${new URLSearchParams({ data: spaydText })}`);
    return true;
  }

  private async answered(): Promise<boolean> {
    if (!this.document.defaultView?.navigator.serviceWorker?.controller) {
      return false;
    }
    try {
      const response = await firstValueFrom(
        this.http
          .head(PAYMENT_ROUTE, { observe: 'response', responseType: 'text' })
          .pipe(timeout(PROBE_TIMEOUT_MS)),
      );
      return response.headers.get('Content-Type')?.startsWith(SPAYD_MEDIA_TYPE) ?? false;
    } catch {
      return false;
    }
  }
}
