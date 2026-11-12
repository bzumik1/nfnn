import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { WITHOUT_ACCESS_TOKEN } from '../../core/auth/auth-interceptor';

export interface BankLogoItem {
  code: string;
  imageId: string;
}

export interface BankLogosResponse {
  items: BankLogoItem[];
}

const BANK_LOGOS_URL = '/api/donations/bank-logos';

export function bankLogoImageUrl(imageId: string): string {
  return `${BANK_LOGOS_URL}/images/${encodeURIComponent(imageId)}`;
}

@Injectable({ providedIn: 'root' })
export class BankLogosApi {
  private readonly http = inject(HttpClient);

  list(): Observable<BankLogosResponse> {
    return this.http.get<BankLogosResponse>(BANK_LOGOS_URL, {
      context: new HttpContext().set(WITHOUT_ACCESS_TOKEN, true),
    });
  }
}
