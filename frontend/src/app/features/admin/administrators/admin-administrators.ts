import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule, NgForm } from '@angular/forms';
import { Router } from '@angular/router';
import { describeProblem, problemTypeEndsWith } from '../../../core/auth/api-problem';
import { AuthStore } from '../../../core/auth/auth-store';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { FocusFirstInvalid } from '../../../shared/ui/form-field/focus-first-invalid';
import { FormControlDirective } from '../../../shared/ui/form-field/form-control';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { AdminApi, AdministratorResponse } from '../admin-api';

type LoadState = 'loading' | 'ready' | 'error';

interface Notice {
  kind: 'status' | 'alert';
  text: string;
}

type PendingAction = { kind: 'revoke' | 'reset'; donorId: string } | null;

const UNAUTHENTICATED = 'auth/unauthenticated';
const FORBIDDEN = 'auth/forbidden';

@Component({
  selector: 'app-admin-administrators',
  imports: [FormsModule, FormField, FormControlDirective, FocusFirstInvalid],
  templateUrl: './admin-administrators.html',
  styleUrl: './admin-administrators.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminAdministrators {
  private readonly api = inject(AdminApi);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly loginDialog = inject(LoginDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly title = viewChild.required<ElementRef<HTMLHeadingElement>>('title');

  protected readonly state = signal<LoadState>('loading');
  protected readonly items = signal<AdministratorResponse[]>([]);
  protected readonly notice = signal<Notice | null>(null);
  protected readonly busy = signal(false);
  protected readonly grantError = signal<string | null>(null);
  protected readonly pending = signal<PendingAction>(null);
  protected readonly self = this.auth.donor;

  protected readonly emailMessages = {
    required: $localize`:@@admin.administrators.email.required:Vyplňte prosím e-mail registrovaného dárce.`,
    email: $localize`:@@admin.administrators.email.invalid:Zadejte prosím platnou e-mailovou adresu.`,
  };

  protected email = '';

  constructor() {
    this.load();
    afterNextRender(() => this.title().nativeElement.focus(), { injector: this.injector });
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .administrators()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          this.items.set(list.items);
          this.state.set('ready');
        },
        error: (failure: unknown) => {
          if (problemTypeEndsWith(failure, UNAUTHENTICATED)) {
            this.sendToSignIn();
            return;
          }
          if (problemTypeEndsWith(failure, FORBIDDEN)) {
            this.router.navigateByUrl('/darce/prehled');
            return;
          }
          this.state.set('error');
        },
      });
  }

  protected isSelf(item: AdministratorResponse): boolean {
    return this.self()?.id === item.donorId;
  }

  protected grant(form: NgForm): void {
    if (form.invalid || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.grantError.set(null);
    this.notice.set(null);
    this.api
      .grantAdministration(this.email.trim())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (added) => {
          this.busy.set(false);
          this.email = '';
          form.resetForm();
          this.notice.set({
            kind: 'status',
            text: added.secondFactorEnabled
              ? $localize`:@@admin.administrators.grant.doneWithFactor:${added.name}:name: je teď správce. Správa se mu otevře po dalším přihlášení.`
              : $localize`:@@admin.administrators.grant.done:${added.name}:name: je teď správce. Správa se mu otevře, až si zapne dvoufaktorové ověření a přihlásí se s kódem z aplikace.`,
          });
          this.load();
        },
        error: (failure: unknown) => {
          this.busy.set(false);
          this.grantError.set(
            describeProblem(
              failure,
              $localize`:@@admin.administrators.grant.failed:Správce se nepodařilo přidat. Zkuste to prosím znovu.`,
            ),
          );
        },
      });
  }

  protected ask(kind: 'revoke' | 'reset', item: AdministratorResponse): void {
    this.pending.set({ kind, donorId: item.donorId });
    this.notice.set(null);
  }

  protected cancel(): void {
    this.pending.set(null);
  }

  protected isPending(kind: 'revoke' | 'reset', item: AdministratorResponse): boolean {
    const pending = this.pending();
    return pending !== null && pending.kind === kind && pending.donorId === item.donorId;
  }

  protected revoke(item: AdministratorResponse): void {
    this.run(
      this.api.revokeAdministration(item.donorId),
      $localize`:@@admin.administrators.revoke.done:${item.name}:name: už není správce. Všechna jeho přihlášení jsme ukončili.`,
      $localize`:@@admin.administrators.revoke.failed:Správce se nepodařilo odebrat. Zkuste to prosím znovu.`,
    );
  }

  protected reset(item: AdministratorResponse): void {
    this.run(
      this.api.resetSecondFactor(item.donorId),
      $localize`:@@admin.administrators.reset.done:Dvoufaktorové ověření u ${item.name}:name: je vypnuté a všechna jeho přihlášení jsme ukončili. Poslali jsme mu e-mail; po přihlášení heslem si ho může zapnout znovu.`,
      $localize`:@@admin.administrators.reset.failed:Dvoufaktorové ověření se nepodařilo vypnout. Zkuste to prosím znovu.`,
    );
  }

  private run(
    request: ReturnType<AdminApi['revokeAdministration']>,
    done: string,
    failed: string,
  ): void {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.busy.set(false);
        this.pending.set(null);
        this.notice.set({ kind: 'status', text: done });
        this.load();
      },
      error: (failure: unknown) => {
        this.busy.set(false);
        this.pending.set(null);
        this.notice.set({ kind: 'alert', text: describeProblem(failure, failed) });
      },
    });
  }

  private sendToSignIn(): void {
    const returnTo = this.router.url;
    this.auth.logout().subscribe(() => {
      this.router.navigateByUrl('/');
      this.loginDialog.open('login', { returnTo });
    });
  }
}
