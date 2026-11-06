import { InjectionToken, Signal, signal, Type } from '@angular/core';

export interface FirstDownloadProgress {
  readonly done: number;
  readonly total: number;
}

export interface AdministrationLock {
  readonly locked: Signal<boolean>;
  readonly panel: Signal<Type<unknown> | null>;
  readonly keepsPage: Signal<boolean>;
  readonly firstDownload: Signal<FirstDownloadProgress | null>;
}

export const ADMINISTRATION_LOCK = new InjectionToken<AdministrationLock>('ADMINISTRATION_LOCK', {
  providedIn: 'root',
  factory: () => ({
    locked: signal(false).asReadonly(),
    panel: signal(null).asReadonly(),
    keepsPage: signal(false).asReadonly(),
    firstDownload: signal(null).asReadonly(),
  }),
});
