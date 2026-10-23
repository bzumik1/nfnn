/// <reference types="@angular/localize" />

import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { describeProblem, problemTypeEndsWith } from '../../../core/auth/api-problem';
import { AuthApi } from '../../../core/auth/auth-api';
import { AuthStore } from '../../../core/auth/auth-store';
import { AuthorizationRequest, ClientDescription } from '../../../core/auth/donor';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { ExternalNavigation } from '../../../core/navigation/external-navigation';
import { describeScopes, knownScopes, WRITE_SCOPE } from './oauth-scopes';

type Panel = 'incomplete' | 'checking' | 'sign-in' | 'consent' | 'not-admin' | 'leaving' | 'failed';

const UNAUTHENTICATED = 'auth/unauthenticated';

interface ConnectionRequest {
  clientId: string;
  redirectUri: string;
  responseType: string | null;
  codeChallenge: string | null;
  codeChallengeMethod: string | null;
  scope: string | null;
  resource: string | null;
  state: string | null;
}

@Component({
  selector: 'app-connect-app',
  templateUrl: './connect-app.html',
  styleUrl: './connect-app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConnectApp {
  private readonly authApi = inject(AuthApi);
  private readonly auth = inject(AuthStore);
  private readonly dialog = inject(LoginDialogService);
  private readonly navigation = inject(ExternalNavigation);
  private readonly injector = inject(Injector);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  private readonly request = requestOf(inject(ActivatedRoute).snapshot.queryParamMap);

  protected readonly panel = signal<Panel>(this.request === null ? 'incomplete' : 'checking');
  protected readonly client = signal<ClientDescription | null>(null);
  protected readonly error = signal('');
  protected readonly deciding = signal<'allow' | 'deny' | null>(null);
  protected readonly allowWrite = signal(false);
  private readonly requested = knownScopes(this.request?.scope ?? null);
  protected readonly scopes = describeScopes(
    this.requested.filter((scope) => scope !== WRITE_SCOPE),
  );
  protected readonly writeRequested = this.requested.includes(WRITE_SCOPE);
  protected readonly writeDescription = describeScopes([WRITE_SCOPE])[0] ?? '';
  protected readonly unknownScope = this.requested.length === 0 && this.request !== null;
  private readonly grantedScope = computed(() =>
    this.requested.filter((scope) => scope !== WRITE_SCOPE || this.allowWrite()).join(' '),
  );
  protected readonly donorName = computed(() => this.auth.donor()?.name ?? '');

  constructor() {
    effect(() => {
      const status = this.auth.status();
      untracked(() => this.follow(status));
    });
  }

  signIn(): void {
    this.dialog.open('login');
  }

  allow(): void {
    this.decide(true);
  }

  deny(): void {
    this.decide(false);
  }

  chooseWrite(event: Event): void {
    this.allowWrite.set((event.target as HTMLInputElement).checked);
  }

  retry(): void {
    if (this.request !== null) {
      this.show('checking');
      this.describe();
    }
  }

  private follow(status: 'unknown' | 'anonymous' | 'signed-in'): void {
    if (this.request === null || status === 'unknown') {
      return;
    }
    if (status === 'anonymous') {
      if (this.panel() !== 'leaving') {
        this.show('sign-in');
      }
      return;
    }
    if (this.panel() === 'sign-in' || this.panel() === 'checking') {
      this.describe();
    }
  }

  private describe(): void {
    const request = this.request;
    if (request === null) {
      return;
    }
    this.authApi.describeClient(request.clientId, request.redirectUri).subscribe({
      next: (client) => {
        this.client.set(client);
        this.show(this.auth.isAdmin() ? 'consent' : 'not-admin');
      },
      error: (failure: unknown) => this.fail(failure),
    });
  }

  private decide(approved: boolean): void {
    const request = this.request;
    if (request === null || this.deciding() !== null) {
      return;
    }
    this.deciding.set(approved ? 'allow' : 'deny');
    this.error.set('');
    const body: AuthorizationRequest = {
      ...request,
      scope: approved ? this.grantedScope() : request.scope,
      approved,
    };
    this.authApi.authorize(body).subscribe({
      next: (response) => {
        this.deciding.set(null);
        this.show('leaving');
        this.navigation.assign(response.redirectTo);
      },
      error: (failure: unknown) => {
        this.deciding.set(null);
        this.fail(failure);
      },
    });
  }

  private fail(failure: unknown): void {
    if (problemTypeEndsWith(failure, UNAUTHENTICATED) || this.auth.status() === 'anonymous') {
      this.show('sign-in');
      return;
    }
    this.error.set(
      describeProblem(
        failure,
        $localize`:@@donor.connect.error.generic:Spojení se serverem se nepodařilo. Zkuste to prosím znovu.`,
      ),
    );
    this.show('failed');
  }

  private show(panel: Panel): void {
    this.panel.set(panel);
    afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.injector });
  }
}

function requestOf(params: { get(name: string): string | null }): ConnectionRequest | null {
  const clientId = params.get('client_id');
  const redirectUri = params.get('redirect_uri');
  if (!clientId || !redirectUri) {
    return null;
  }
  return {
    clientId,
    redirectUri,
    responseType: params.get('response_type'),
    codeChallenge: params.get('code_challenge'),
    codeChallengeMethod: params.get('code_challenge_method'),
    scope: params.get('scope'),
    resource: params.get('resource'),
    state: params.get('state'),
  };
}
