import { inject, InjectionToken, Injector } from '@angular/core';

import type { PasskeyAuthenticator } from './passkey-authenticator';

export const PASSKEY_AUTHENTICATOR_LOADER = new InjectionToken<() => Promise<PasskeyAuthenticator>>(
  'PASSKEY_AUTHENTICATOR_LOADER',
  {
    providedIn: 'root',
    factory: () => {
      const injector = inject(Injector);
      return () =>
        import('./passkey-authenticator').then((loaded) =>
          injector.get(loaded.PasskeyAuthenticator),
        );
    },
  },
);
