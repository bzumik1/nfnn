import { ChangeDetectionStrategy, Component } from '@angular/core';
import {
  VERIFICATION_CONTEXT,
  type VerificationContext,
} from '../../donations/verification/verification-context';
import { VerificationPage } from '../../donations/verification/verification-page';
import { RegisterLine } from './register-line';

export const ADMIN_VERIFICATION_PATH = '/sprava/overit';

const ADMIN_VERIFICATION: VerificationContext = {
  path: ADMIN_VERIFICATION_PATH,
  audience: 'administration',
  registerLine: RegisterLine,
};

@Component({
  selector: 'app-admin-verification',
  imports: [VerificationPage],
  template: '<app-verification-page />',
  providers: [{ provide: VERIFICATION_CONTEXT, useValue: ADMIN_VERIFICATION }],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminVerification {}
