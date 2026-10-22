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
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { formatBankTime } from '../../donations/donation-date';
import { DashboardTopBar } from '../../donors/dashboard/top-bar/top-bar';
import { AdminApi, SymbolClaimResponse } from '../admin-api';

type LoadState = 'loading' | 'ready' | 'error';

interface Notice {
  kind: 'status' | 'alert';
  text: string;
}

const UNAUTHENTICATED = 'auth/unauthenticated';
const FORBIDDEN = 'auth/forbidden';

@Component({
  selector: 'app-admin-symbol-claims',
  imports: [DashboardTopBar, RouterLink],
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
  private readonly title = viewChild.required<ElementRef<HTMLHeadingElement>>('title');

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
    if (count === 1) {
      return $localize`:@@admin.symbolClaims.donations.one:1 dar`;
    }
    if (count >= 2 && count <= 4) {
      return $localize`:@@admin.symbolClaims.donations.few:${count}:count: dary`;
    }
    return $localize`:@@admin.symbolClaims.donations.many:${count}:count: darů`;
  }

  protected ask(item: SymbolClaimResponse): void {
    this.pending.set(item.id);
    this.notice.set(null);
  }

  protected cancel(): void {
    this.pending.set(null);
  }

  protected isPending(item: SymbolClaimResponse): boolean {
    return this.pending() === item.id;
  }

  protected reverse(item: SymbolClaimResponse): void {
    this.run(
      this.api.reverseSymbolClaim(item.id),
      $localize`:@@admin.symbolClaims.reverse.done:Odpověď Ano u ${this.donorName(item)}:name: (VS ${item.variableSymbol}:symbol:) je zrušená: ${this.donations(item.donationCount)}:donations: jsme smazali a platby s tímto symbolem jsou zase nespárované. Dárce se už neptáme.`,
      $localize`:@@admin.symbolClaims.reverse.failed:Odpověď se nepodařilo zrušit. Zkuste to prosím znovu.`,
    );
  }

  protected reset(item: SymbolClaimResponse): void {
    this.run(
      this.api.deleteSymbolClaim(item.id),
      $localize`:@@admin.symbolClaims.reset.done:Odpověď Ne u ${this.donorName(item)}:name: (VS ${item.variableSymbol}:symbol:) jsme smazali. Pokud otázka pořád platí, nástěnka se dárce zeptá znovu.`,
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
    this.auth.logout().subscribe(() => {
      this.router.navigateByUrl('/');
      this.loginDialog.open();
    });
  }
}
