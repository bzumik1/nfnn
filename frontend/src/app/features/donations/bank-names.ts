import { inject, Injectable, signal } from '@angular/core';
import { Connectivity } from '../../core/connectivity/connectivity';
import { BankCodesApi } from './bank-codes-api';
import { bankLogoImageUrl, BankLogosApi } from './bank-logos-api';
import { bankCodeOf } from './czech-account';
import { bankNameOf, shortBankName } from './czech-banks';

const BANK_CODE = /^[0-9]{4}$/;
const IMAGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type ServedList = 'idle' | 'asking' | 'held';
type LogoList = 'idle' | 'asking' | 'settled';

@Injectable({ providedIn: 'root' })
export class BankNames {
  private readonly api = inject(BankCodesApi);
  private readonly logosApi = inject(BankLogosApi);
  private readonly connectivity = inject(Connectivity);
  private readonly served = signal<ReadonlyMap<string, string>>(new Map());
  private list: ServedList = 'idle';
  private readonly logos = signal<ReadonlyMap<string, string>>(new Map());
  private logoList: LogoList = 'idle';

  nameOf(account: string): string | null {
    const ownName = bankNameOf(account);
    if (ownName !== null) {
      return ownName;
    }
    const bankCode = bankCodeOf(account);
    return bankCode === null ? null : (this.served().get(bankCode) ?? null);
  }

  logoOf(account: string): string | null {
    const bankCode = bankCodeOf(account);
    const imageId = bankCode === null ? undefined : this.logos().get(bankCode);
    return imageId === undefined ? null : bankLogoImageUrl(imageId);
  }

  require(account: string): void {
    if (bankCodeOf(account) === null || this.connectivity.offline()) {
      return;
    }
    this.requireLogos();
    if (this.list !== 'idle' || bankNameOf(account) !== null) {
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

  private requireLogos(): void {
    if (this.logoList !== 'idle') {
      return;
    }
    this.logoList = 'asking';
    this.logosApi.list().subscribe({
      next: (response) => {
        this.logos.set(logosOf(response));
        this.logoList = 'settled';
      },
      error: () => (this.logoList = 'settled'),
    });
  }
}

function logosOf(response: unknown): ReadonlyMap<string, string> {
  const items = (response as { items?: unknown } | null)?.items;
  const logos = new Map<string, string>();
  if (!Array.isArray(items)) {
    return logos;
  }
  for (const item of items as unknown[]) {
    const { code, imageId } = (item ?? {}) as { code?: unknown; imageId?: unknown };
    if (
      typeof code === 'string' &&
      BANK_CODE.test(code) &&
      typeof imageId === 'string' &&
      IMAGE_ID.test(imageId)
    ) {
      logos.set(code, imageId);
    }
  }
  return logos;
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
