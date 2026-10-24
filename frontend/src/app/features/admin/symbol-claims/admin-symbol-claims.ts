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
import { Router, RouterLink } from '@angular/router';
import { describeProblem, problemTypeEndsWith } from '../../../core/auth/api-problem';
import { AuthStore } from '../../../core/auth/auth-store';
import { pluralCategory } from '../../../core/i18n/plural-category';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { formatBankTime } from '../../donations/donation-date';
import { AdminApi, SymbolClaimResponse } from '../admin-api';
import { LiveNotice, Notice } from '../../../shared/ui/live-notice/live-notice';

type LoadState = 'loading' | 'ready' | 'error';

const UNAUTHENTICATED = 'auth/unauthenticated';
const FORBIDDEN = 'auth/forbidden';

@Component({
  selector: 'app-admin-symbol-claims',
  imports: [LiveNotice, RouterLink],
  templateUrl: './admin-symbol-claims.html',
  styleUrl: './admin-symbol-claims.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSymbolClaims {
  private readonly api = inject(AdminApi);
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
  protected readonly items = signal<SymbolClaimResponse[]>([]);
  protected readonly notice = signal<Notice | null>(null);
  protected readonly busy = signal(false);
  protected readonly pending = signal<string | null>(null);

  constructor() {
    this.load();
    afterNextRender(() => this.title().nativeElement.focus(), { injector: this.injector });
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .symbolClaims()
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

  protected answeredAt(item: SymbolClaimResponse): string {
    return formatBankTime(item.answeredAt);
  }

  protected donorName(item: SymbolClaimResponse): string {
    return item.donorName ?? $localize`:@@admin.symbolClaims.donor.missing:dárce bez záznamu`;
  }

  protected donations(count: number): string {
    switch (pluralCategory(count)) {
      case 'one':
        return $localize`:@@admin.symbolClaims.donations.one:1 dar`;
      case 'few':
        return $localize`:@@admin.symbolClaims.donations.few:${count}:count: dary`;
      case 'other':
        return $localize`:@@admin.symbolClaims.donations.many:${count}:count: darů`;
    }
  }

  protected ask(item: SymbolClaimResponse): void {
    this.pending.set(item.id);
    this.notice.set(null);
    this.focusAfterRender(() => this.confirmCancel()?.nativeElement ?? null);
  }

  protected cancel(): void {
    const opener = this.openerOf(this.pending());
    this.pending.set(null);
    this.focusAfterRender(opener);
  }

  protected openerId(item: SymbolClaimResponse): string {
    return openerId(item.id);
  }

  protected isPending(item: SymbolClaimResponse): boolean {
    return this.pending() === item.id;
  }

  protected reverse(item: SymbolClaimResponse): void {
    this.run(
      this.api.reverseSymbolClaim(item.id),
      $localize`:@@admin.symbolClaims.reverse.done:Přiřazení darů u ${this.donorName(item)}:name: (VS ${item.variableSymbol}:symbol:) jsme vrátili: ${this.donations(item.donationCount)}:donations: jsme smazali a platby s tímto symbolem zase čekají na přiřazení. Odpověď je teď Ne, dárce se už neptáme.`,
      $localize`:@@admin.symbolClaims.reverse.failed:Přiřazení darů se nepodařilo vrátit. Zkuste to prosím znovu.`,
    );
  }

  protected reset(item: SymbolClaimResponse): void {
    this.run(
      this.api.deleteSymbolClaim(item.id),
      $localize`:@@admin.symbolClaims.reset.done:Odpověď Ne u ${this.donorName(item)}:name: (VS ${item.variableSymbol}:symbol:) jsme smazali. Pokud otázka pořád platí, dárce ji uvidí znovu ve svém přehledu.`,
      $localize`:@@admin.symbolClaims.reset.failed:Odpověď se nepodařilo smazat. Zkuste to prosím znovu.`,
    );
  }

  private run(
    request: ReturnType<AdminApi['reverseSymbolClaim']>,
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

  private openerOf(claimId: string | null): () => HTMLElement | null {
    return () =>
      claimId === null
        ? null
        : this.host.nativeElement.querySelector<HTMLElement>(`#${openerId(claimId)}`);
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

function openerId(claimId: string): string {
  return `symbol-claim-action-${claimId.replace(/[^A-Za-z0-9_-]/g, '_')}`;
}
