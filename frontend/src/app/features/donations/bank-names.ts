import { inject, Injectable, signal } from '@angular/core';
import { Connectivity } from '../../core/connectivity/connectivity';
import { BankCodesApi } from './bank-codes-api';
import { bankCodeOf } from './czech-account';
import { bankNameOf, shortBankName } from './czech-banks';

const BANK_CODE = /^[0-9]{4}$/;

type ServedList = 'idle' | 'asking' | 'held';

@Injectable({ providedIn: 'root' })
export class BankNames {
  private readonly api = inject(BankCodesApi);
  private readonly connectivity = inject(Connectivity);
  private readonly served = signal<ReadonlyMap<string, string>>(new Map());
  private list: ServedList = 'idle';

  nameOf(account: string): string | null {
    const ownName = bankNameOf(account);
    if (ownName !== null) {
      return ownName;
    }
    const bankCode = bankCodeOf(account);
    return bankCode === null ? null : (this.served().get(bankCode) ?? null);
  }

  require(account: string): void {
    if (
      this.list !== 'idle' ||
      this.connectivity.offline() ||
      bankNameOf(account) !== null ||
      bankCodeOf(account) === null
    ) {
      return;
    }
    this.list = 'asking';
    this.api.list().subscribe({
      next: (response) => {
        const names = shortNamesOf(response);
        this.served.set(names);
        this.list = names.size > 0 ? 'held' : 'idle';
      },
      error: () => (this.list = 'idle'),
    });
  }
}

function shortNamesOf(response: unknown): ReadonlyMap<string, string> {
  const items = (response as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) {
    return new Map();
  }
  const names = new Map<string, string>();
  for (const item of items as unknown[]) {
    const { code, name } = (item ?? {}) as { code?: unknown; name?: unknown };
    if (typeof code === 'string' && BANK_CODE.test(code) && typeof name === 'string') {
      names.set(code, shortBankName(name));
    }
  }
  return names;
}
