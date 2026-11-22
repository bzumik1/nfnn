/// <reference types="@angular/localize" />

import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  effect,
  ElementRef,
  inject,
  Injector,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { describeProblem, problemTypeEndsWith } from '../../../../core/auth/api-problem';
import { AuthApi } from '../../../../core/auth/auth-api';
import { AuthStore } from '../../../../core/auth/auth-store';
import { ConnectedApp } from '../../../../core/auth/donor';
import { formatDonationDate } from '../../../donations/donation-date';
import { describeScopes } from '../../connect-app/oauth-scopes';
import { BusyButton } from '../../../../shared/ui/busy-button/busy-button';
import { BusyAnnouncement } from '../../../../shared/ui/busy-label/busy-announcement';
import { BusyLabel } from '../../../../shared/ui/busy-label/busy-label';
import { NeedsConnection } from '../../../../shared/ui/needs-connection/needs-connection';
import { ListChanges } from '../../../../core/kept/list-changes';
import { KeptDonorAnswers } from '../kept-donor-answers';
import { leaveWithClass, markRowsLeaving } from '../../../../shared/ui/leaving-row/leaving-row';

const UNAUTHENTICATED = 'auth/unauthenticated';

@Component({
  selector: 'app-connected-apps-card',
  providers: [BusyAnnouncement],
  imports: [BusyButton, BusyLabel, NeedsConnection],
  templateUrl: './connected-apps-card.html',
  styleUrl: './connected-apps-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConnectedAppsCard {
  protected readonly busyAnnouncement = inject(BusyAnnouncement);
  private readonly auth = inject(AuthStore);
  private readonly authApi = inject(AuthApi);
  private readonly kept = inject(KeptDonorAnswers);
  private readonly changes = new ListChanges(() => this.loadConnections(false, true));
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly title = viewChild.required<ElementRef<HTMLElement>>('title');

  readonly sessionEnded = output<void>();

  protected readonly connections = signal<ConnectedApp[] | null>(null);
  protected readonly connectionsError = signal('');
  protected readonly disconnecting = signal<string | null>(null);
  protected readonly disconnected = signal('');
  protected readonly rowLeft = signal(false);
  protected readonly rowLeaves = leaveWithClass('connection-slot--leaving', {
    settling: 'connection-slot--settling',
  });

  constructor() {
    this.loadConnections(true);
    effect(() => {
      const connections = this.connections();
      if (connections !== null) {
        this.kept.keep('connections', { items: connections });
      }
    });
  }

  loadConnections(shownBefore = false, quietly = false): void {
    this.connectionsError.set('');
    const server = this.changes.track(this.authApi.connections());
    const connections = shownBefore ? this.kept.read('connections', server) : server;
    connections.subscribe({
      next: (list) => this.connections.set(list.items),
      error: (failure: unknown) => {
        if (this.sessionLost(failure) || (quietly && this.connections() !== null)) {
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
    this.changes.changing();
    this.disconnecting.set(app.id);
    this.connectionsError.set('');
    this.disconnected.set('');
    this.authApi.disconnect(app.id).subscribe({
      next: () => {
        markRowsLeaving([this.document.getElementById(this.rowId(app))]);
        this.disconnecting.set(null);
        this.rowLeft.set(true);
        this.connections.update((apps) => (apps ?? []).filter((other) => other.id !== app.id));
        this.disconnected.set(app.client);
        afterNextRender(() => this.title().nativeElement.focus(), { injector: this.injector });
        this.changes.changed();
      },
      error: (failure: unknown) => {
        this.disconnecting.set(null);
        if (this.sessionLost(failure)) {
          return;
        }
        this.changes.changed();
        this.connectionsError.set(
          describeProblem(
            failure,
            $localize`:@@donor.account.connections.error.disconnect:Aplikaci se nepodařilo odpojit. Zkuste to prosím znovu.`,
          ),
        );
      },
    });
  }

  protected rowId(app: ConnectedApp): string {
    return `connection-row-${app.id}`;
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
