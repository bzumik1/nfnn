import { ChangeDetectionStrategy, Component, inject, input, viewChild } from '@angular/core';
import { DONATE_SECTION } from '../../../../../core/auth/confirmation-return';
import { LoginDialogService } from '../../../../../core/auth/login-dialog.service';
import { PaymentPanel } from '../../../../donations/payment-panel/payment-panel';

@Component({
  selector: 'app-donate-cta',
  imports: [PaymentPanel],
  templateUrl: './donate-cta.html',
  styleUrl: './donate-cta.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DonateCta {
  private readonly loginDialog = inject(LoginDialogService);
  private readonly paymentPanel = viewChild.required(PaymentPanel);

  readonly variableSymbol = input<string | null>(null);
  readonly donorName = input<string | null>(null);

  register(): void {
    this.loginDialog.open('register', { confirmationReturnTo: DONATE_SECTION });
  }

  signIn(): void {
    this.loginDialog.open('login', {
      afterSignIn: () => this.paymentPanel().focusBankDetails(),
      confirmationReturnTo: DONATE_SECTION,
    });
  }
}
