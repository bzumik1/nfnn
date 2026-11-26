import { InjectionToken } from '@angular/core';

import type { CopyProfile } from './copy-profile';
import type { Donor } from './donor';

export type DonorFromCopy = (profile: CopyProfile) => Donor;

export const DONOR_FROM_COPY_LOADER = new InjectionToken<() => Promise<DonorFromCopy>>(
  'DONOR_FROM_COPY_LOADER',
  {
    providedIn: 'root',
    factory: () => () => import('./copy-profile').then((loaded) => loaded.donorFromCopy),
  },
);
