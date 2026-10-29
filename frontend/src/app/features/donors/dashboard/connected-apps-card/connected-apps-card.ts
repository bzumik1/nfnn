/// <reference types="@angular/localize" />

import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { describeProblem, problemTypeEndsWith } from '../../../../core/auth/api-problem';
import { AuthApi } from '../../../../core/auth/auth-api';
import { AuthStore } from '../../../../core/auth/auth-store';
import { ConnectedApp } from '../../../../core/auth/donor';
import { formatDonationDate } from '../../../donations/donation-date';
import { describeScopes } from '../../connect-app/oauth-scopes';

const UNAUTHENTICATED = 'auth/unauthenticated';

@Component({
  selector: 'app-connected-apps-card',
  templateUrl: './connected-apps-card.html',
  styleUrl: './connected-apps-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConnectedAppsCard {
  private readonly auth = inject(AuthStore);
  private readonly authApi = inject(AuthApi);

  readonly sessionEnded = output<void>();

  protected readonly connections = signal<ConnectedApp[] | null>(null);
  protected readonly connectionsError = signal('');
  protected readonly disconnecting = signal<string | null>(null);
  protected readonly disconnected = signal('');

  constructor() {
    this.loadConnections();
  }

  loadConnections(): void {
    this.connectionsError.set('');
    this.authApi.connections().subscribe({
      next: (list) => this.connections.set(list.items),
      error: (failure: unknown) => {
        if (this.sessionLost(failure)) {
          return;
        }
        this.connectionsError.set(
          describeProblem(
            failure,
            $localize`:@@donor.account.connections.error.load:Připojené aplikace se nepodařilo načíst.`,
          ),
        );
      },
    });
  }

  disconnect(app: ConnectedApp): void {
    if (this.disconnecting() !== null) {
      return;
    }
    this.disconnecting.set(app.id);
    this.connectionsError.set('');
    this.disconnected.set('');
    this.authApi.disconnect(app.id).subscribe({
      next: () => {
        this.disconnecting.set(null);
        this.connections.update((apps) => (apps ?? []).filter((other) => other.id !== app.id));
        this.disconnected.set(app.client);
      },
      error: (failure: unknown) => {
        this.disconnecting.set(null);
        if (this.sessionLost(failure)) {
          return;
        }
        this.connectionsError.set(
          describeProblem(
            failure,
            $localize`:@@donor.account.connections.error.disconnect:Aplikaci se nepodařilo odpojit. Zkuste to prosím znovu.`,
          ),
        );
      },
    });
  }

  protected scopeLabels(app: ConnectedApp): string[] {
    return describeScopes(app.scopes);
  }

  protected formatDate(isoInstant: string): string {
    return formatDonationDate(isoInstant);
  }

  private sessionLost(failure: unknown): boolean {
    if (problemTypeEndsWith(failure, UNAUTHENTICATED) || this.auth.status() === 'anonymous') {
      this.sessionEnded.emit();
      return true;
    }
    return false;
  }
}
