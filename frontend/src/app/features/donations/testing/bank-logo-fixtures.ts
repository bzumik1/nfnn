import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { BankLogoItem, BankLogosResponse } from '../bank-logos-api';

export const LOGO_IMAGE_ID = '019a7c00-0000-7000-8000-0000000000aa';

@Injectable()
export class FakeBankLogosApi {
  items: BankLogoItem[] = [];
  asked = 0;

  list(): Observable<BankLogosResponse> {
    this.asked++;
    return of({ items: this.items });
  }
}
