import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AuthStore } from '../../../core/auth/auth-store';
import { DonateCta } from '../home/sections/donate-cta/donate-cta';

@Component({
  selector: 'app-donate-page',
  imports: [DonateCta],
  templateUrl: './donate-page.html',
  styleUrl: './donate-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DonatePage {
  private readonly auth = inject(AuthStore);

  protected readonly variableSymbol = computed(() => this.auth.donor()?.variableSymbol ?? null);
  protected readonly donorName = computed(() => this.auth.donor()?.name ?? null);
}
