import { InjectionToken, Signal, signal, Type } from '@angular/core';

export interface AdministrationLock {
  readonly locked: Signal<boolean>;
  readonly panel: Signal<Type<unknown> | null>;
}

export const ADMINISTRATION_LOCK = new InjectionToken<AdministrationLock>('ADMINISTRATION_LOCK', {
  providedIn: 'root',
  factory: () => ({ locked: signal(false).asReadonly(), panel: signal(null).asReadonly() }),
});
