import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { BankLogoItem, BankLogosApi, BankLogosResponse } from '../bank-logos-api';

export const LOGO_IMAGE_ID = '019a7c00-0000-7000-8000-0000000000aa';

@Injectable()
export class FakeBankLogosApi implements Pick<BankLogosApi, 'list'> {
  items: BankLogoItem[] = [];

  list(): Observable<BankLogosResponse> {
    return of({ items: this.items });
  }
}
