import { inject, Injectable, signal } from '@angular/core';
import { BankCodesApi } from './bank-codes-api';
import { bankCodeOf } from './czech-account';
import { bankNameOf, shortBankName } from './czech-banks';

@Injectable({ providedIn: 'root' })
export class BankNames {
  private readonly api = inject(BankCodesApi);
  private readonly served = signal<ReadonlyMap<string, string>>(new Map());
  private asked = false;

  nameOf(account: string): string | null {
    const ownName = bankNameOf(account);
    if (ownName !== null) {
      return ownName;
    }
    const bankCode = bankCodeOf(account);
    const servedName = bankCode === null ? undefined : this.served().get(bankCode);
    return servedName === undefined ? null : shortBankName(servedName);
  }

  require(account: string): void {
    if (this.asked || bankNameOf(account) !== null || bankCodeOf(account) === null) {
      return;
    }
    this.asked = true;
    this.api.list().subscribe({
      next: (response) =>
        this.served.set(new Map(response.items.map((item) => [item.code, item.name]))),
      error: () => undefined,
    });
  }
}
