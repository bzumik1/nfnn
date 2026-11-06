import { InjectionToken, type Type } from '@angular/core';

export interface VerificationContext {
  readonly path: string;
  readonly standalonePage: boolean;
  readonly registerLine: Type<unknown> | null;
}

export const PUBLIC_VERIFICATION: VerificationContext = {
  path: '/overit',
  standalonePage: true,
  registerLine: null,
};

export const VERIFICATION_CONTEXT = new InjectionToken<VerificationContext>(
  'VERIFICATION_CONTEXT',
  { providedIn: 'root', factory: () => PUBLIC_VERIFICATION },
);
