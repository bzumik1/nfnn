import { InjectionToken } from '@angular/core';

import type {
  AdministrationCopyState,
  AgeBucket,
  CopyMode,
  DonorCopyState,
} from './diagnostics-schema';

export interface DeviceCopyDiagnostics {
  readonly mode: CopyMode | null;
  readonly donorCopy: DonorCopyState;
  readonly storedAge: AgeBucket | null;
  readonly administrationCopy: AdministrationCopyState;
}

export const DEVICE_COPY_DIAGNOSTICS = new InjectionToken<
  () => Promise<DeviceCopyDiagnostics | null>
>('DEVICE_COPY_DIAGNOSTICS', {
  providedIn: 'root',
  factory: () => () => Promise.resolve(null),
});
