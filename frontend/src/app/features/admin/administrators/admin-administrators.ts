import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { describeProblem, problemTypeEndsWith } from '../../../core/auth/api-problem';
import { AuthStore } from '../../../core/auth/auth-store';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { FocusFirstInvalid } from '../../../shared/ui/form-field/focus-first-invalid';
import { FormControlDirective } from '../../../shared/ui/form-field/form-control';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Avatar } from '../../../shared/ui/avatar/avatar';
import { LiveNotice, Notice } from '../../../shared/ui/live-notice/live-notice';
import { PeopleApi, PersonResponse } from '../../content/people-api';
import { AdminApi, AdministratorResponse } from '../admin-api';

type LoadState = 'loading' | 'ready' | 'error';

type ActionKind = 'revoke' | 'reset';

type PendingAction = { kind: ActionKind; donorId: string } | null;

const UNAUTHENTICATED = 'auth/unauthenticated';
const FORBIDDEN = 'auth/forbidden';
const PORTRAIT_WIDTH = 480;

@Component({
  selector: 'app-admin-administrators',
  imports: [
    LiveNotice,
    FormsModule,
    FormField,
    FormControlDirective,
    FocusFirstInvalid,
    RouterLink,
    Avatar,
  ],
  templateUrl: './admin-administrators.html',
  styleUrl: './admin-administrators.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminAdministrators {
  private readonly api = inject(AdminApi);
  private readonly people = inject(PeopleApi);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly loginDialog = inject(LoginDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly title = viewChild.required<ElementRef<HTMLHeadingElement>>('title');
  private readonly confirmCancel = viewChild<ElementRef<HTMLButtonElement>>('confirmCancel');
  private readonly noticeRegion = viewChild('noticeRegion', { read: ElementRef });

  protected readonly state = signal<LoadState>('loading');
  protected readonly items = signal<AdministratorResponse[]>([]);
  protected readonly notice = signal<Notice | null>(null);
  protected readonly busy = signal(false);
  protected readonly grantError = signal<string | null>(null);
  protected readonly pending = signal<PendingAction>(null);
  protected readonly self = this.auth.donor;
  private readonly members = signal<PersonResponse[]>([]);
  private readonly portraits = computed(() => portraitsByEmail(this.members()));

  protected readonly emailMessages = {
    required: $localize`:@@admin.administrators.email.required:Vyplňte prosím e-mail registrovaného dárce.`,
    email: $localize`:@@admin.administrators.email.invalid:Zadejte prosím platnou e-mailovou adresu.`,
  };

  protected email = '';

  constructor() {
    this.load();
    this.loadPortraits();
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

  protected portraitOf(item: AdministratorResponse): string | null {
    return this.portraits().get(item.email) ?? null;
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
              : $localize`:@@admin.administrators.grant.done:${added.name}:name: je teď správce. Správa se mu otevře, až se přihlásí s kódem z ověřovací aplikace nebo přístupovým klíčem.`,
          });
          this.load();
          this.focusAfterRender(() => this.noticeElement());
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

  protected ask(kind: ActionKind, item: AdministratorResponse): void {
    this.pending.set({ kind, donorId: item.donorId });
    this.notice.set(null);
    this.focusAfterRender(() => this.confirmCancel()?.nativeElement ?? null);
  }

  protected cancel(): void {
    const opener = this.openerOf(this.pending());
    this.pending.set(null);
    this.focusAfterRender(opener);
  }

  protected openerId(kind: ActionKind, item: AdministratorResponse): string {
    return openerId(kind, item.donorId);
  }

  protected revokeQuestion(item: AdministratorResponse): string {
    return $localize`:@@admin.administrators.revoke.confirm.question:${item.name}:name: přestane být správcem a všechna jeho přihlášení skončí. Jeho dárcovský účet zůstane. Odebrat roli správce?`;
  }

  protected revokeLabel(item: AdministratorResponse): string {
    return $localize`:@@admin.administrators.revoke.confirm.label:Odebrat roli správce: ${item.name}:name:?`;
  }

  protected isPending(kind: ActionKind, item: AdministratorResponse): boolean {
    const pending = this.pending();
    return pending !== null && pending.kind === kind && pending.donorId === item.donorId;
  }

  protected revoke(item: AdministratorResponse): void {
    this.run(
      this.api.revokeAdministration(item.donorId),
      $localize`:@@admin.administrators.revoke.done:${item.name}:name: už není správce. Všechna jeho přihlášení jsme ukončili.`,
      $localize`:@@admin.administrators.revoke.failed:Roli správce se nepodařilo odebrat. Zkuste to prosím znovu.`,
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
    const opener = this.openerOf(this.pending());
    this.busy.set(true);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.busy.set(false);
        this.pending.set(null);
        this.notice.set({ kind: 'status', text: done });
        this.load();
        this.focusAfterRender(() => this.noticeElement());
      },
      error: (failure: unknown) => {
        this.busy.set(false);
        this.pending.set(null);
        this.notice.set({ kind: 'alert', text: describeProblem(failure, failed) });
        this.focusAfterRender(() => opener() ?? this.noticeElement());
      },
    });
  }

  private loadPortraits(): void {
    this.people
      .load()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (people) => this.members.set(people.members),
        error: () => this.members.set([]),
      });
  }

  private openerOf(pending: PendingAction): () => HTMLElement | null {
    const id = pending === null ? null : openerId(pending.kind, pending.donorId);
    return () =>
      id === null ? null : this.host.nativeElement.querySelector<HTMLElement>(`#${id}`);
  }

  private noticeElement(): HTMLElement | null {
    return (this.noticeRegion()?.nativeElement as HTMLElement | undefined) ?? null;
  }

  private focusAfterRender(target: () => HTMLElement | null): void {
    afterNextRender(() => target()?.focus(), { injector: this.injector });
  }

  private sendToSignIn(): void {
    const returnTo = this.router.url;
    this.auth.logout().subscribe(() => {
      this.router.navigateByUrl('/');
      this.loginDialog.open('login', { returnTo });
    });
  }
}

function openerId(kind: ActionKind, donorId: string): string {
  return `administrator-${kind}-${donorId.replace(/[^A-Za-z0-9_-]/g, '_')}`;
}

function portraitsByEmail(members: PersonResponse[]): Map<string, string | null> {
  const portraits = new Map<string, string | null>();
  for (const member of members) {
    if (!member.linkedToAccount) {
      continue;
    }
    const portrait = member.portrait ? `${member.portrait.url}?w=${PORTRAIT_WIDTH}` : null;
    for (const email of [member.personalEmail, member.fundEmail]) {
      if (email !== null && !portraits.has(email)) {
        portraits.set(email, portrait);
      }
    }
  }
  return portraits;
}
