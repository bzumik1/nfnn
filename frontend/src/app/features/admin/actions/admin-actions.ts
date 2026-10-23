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
import { Router } from '@angular/router';
import { problemTypeEndsWith } from '../../../core/auth/api-problem';
import { AuthStore } from '../../../core/auth/auth-store';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { formatBankTime } from '../../donations/donation-date';
import { AdminActionResponse, AdminApi } from '../admin-api';

type LoadState = 'loading' | 'ready' | 'error';

const UNAUTHENTICATED = 'auth/unauthenticated';
const FORBIDDEN = 'auth/forbidden';

const ACTION_NAMES: Record<string, string> = {
  PAIR_PAYMENT: $localize`:@@admin.actions.action.pairPayment:Přiřazení platby dárci`,
  UNPAIR_PAYMENT: $localize`:@@admin.actions.action.unpairPayment:Zrušení přiřazení platby`,
  GRANT_ADMINISTRATION: $localize`:@@admin.actions.action.grantAdministration:Přidání správce`,
  REVOKE_ADMINISTRATION: $localize`:@@admin.actions.action.revokeAdministration:Odebrání správce`,
  RESET_SECOND_FACTOR: $localize`:@@admin.actions.action.resetSecondFactor:Vypnutí dvoufaktorového ověření`,
  REVERSE_SYMBOL_CLAIM: $localize`:@@admin.actions.action.reverseSymbolClaim:Zrušení odpovědi Ano na starší symbol`,
  RESET_SYMBOL_CLAIM: $localize`:@@admin.actions.action.resetSymbolClaim:Smazání odpovědi Ne na starší symbol`,
  DISCONNECT_SENDER_ACCOUNT: $localize`:@@admin.actions.action.disconnectSenderAccount:Vypnutí párování bankovního účtu`,
  RECONNECT_SENDER_ACCOUNT: $localize`:@@admin.actions.action.reconnectSenderAccount:Zapnutí párování bankovního účtu`,
  REMOVE_SENDER_ACCOUNT_LINK: $localize`:@@admin.actions.action.removeSenderAccountLink:Odebrání bankovního účtu dárce`,
  ERASE_DONOR: $localize`:@@admin.actions.action.eraseDonor:Výmaz osobních údajů dárce`,
  CHANGE_REPORT_SETTINGS: $localize`:@@admin.actions.action.changeReportSettings:Změna nastavení měsíčního přehledu`,
  SEND_MONTHLY_REPORT: $localize`:@@admin.actions.action.sendMonthlyReport:Ruční odeslání měsíčního přehledu`,
  CREATE_NEWS: $localize`:@@admin.actions.action.createNews:Napsání aktuality`,
  UPDATE_NEWS: $localize`:@@admin.actions.action.updateNews:Úprava aktuality`,
  PUBLISH_NEWS: $localize`:@@admin.actions.action.publishNews:Zveřejnění aktuality`,
  UNPUBLISH_NEWS: $localize`:@@admin.actions.action.unpublishNews:Stažení aktuality z webu`,
  DELETE_NEWS: $localize`:@@admin.actions.action.deleteNews:Smazání aktuality`,
  CREATE_PROJECT: $localize`:@@admin.actions.action.createProject:Napsání projektu`,
  UPDATE_PROJECT: $localize`:@@admin.actions.action.updateProject:Úprava projektu`,
  PUBLISH_PROJECT: $localize`:@@admin.actions.action.publishProject:Zveřejnění projektu`,
  UNPUBLISH_PROJECT: $localize`:@@admin.actions.action.unpublishProject:Stažení projektu z webu`,
  DELETE_PROJECT: $localize`:@@admin.actions.action.deleteProject:Smazání projektu`,
  REQUEST_BACKUP: $localize`:@@admin.actions.action.requestBackup:Spuštění zálohy databáze`,
  REQUEST_TEST_RESTORE: $localize`:@@admin.actions.action.requestTestRestore:Spuštění zkušební obnovy zálohy`,
  DOWNLOAD_BACKUP: $localize`:@@admin.actions.action.downloadBackup:Stažení zálohy databáze`,
};

@Component({
  selector: 'app-admin-actions',
  templateUrl: './admin-actions.html',
  styleUrl: './admin-actions.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminActions {
  private readonly api = inject(AdminApi);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly loginDialog = inject(LoginDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly title = viewChild.required<ElementRef<HTMLHeadingElement>>('title');

  protected readonly state = signal<LoadState>('loading');
  protected readonly items = signal<AdminActionResponse[]>([]);
  protected readonly hasMore = signal(false);
  protected readonly loadingMore = signal(false);
  protected readonly moreFailed = signal(false);

  constructor() {
    this.load();
    afterNextRender(() => this.title().nativeElement.focus(), { injector: this.injector });
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .adminActions()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.items.set(page.items);
          this.hasMore.set(page.hasMore);
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

  protected loadMore(): void {
    const oldest = this.items().at(-1);
    if (oldest === undefined || this.loadingMore()) {
      return;
    }
    this.loadingMore.set(true);
    this.moreFailed.set(false);
    this.api
      .adminActions(oldest.performedAt)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.items.update((current) => [...current, ...page.items]);
          this.hasMore.set(page.hasMore);
          this.loadingMore.set(false);
        },
        error: () => {
          this.loadingMore.set(false);
          this.moreFailed.set(true);
        },
      });
  }

  protected performedAt(item: AdminActionResponse): string {
    return formatBankTime(item.performedAt);
  }

  protected actionName(item: AdminActionResponse): string {
    return ACTION_NAMES[item.action] ?? item.action;
  }

  protected isKnownAction(item: AdminActionResponse): boolean {
    return item.action in ACTION_NAMES;
  }

  private sendToSignIn(): void {
    const returnTo = this.router.url;
    this.auth.logout().subscribe(() => {
      this.router.navigateByUrl('/');
      this.loginDialog.open('login', { returnTo });
    });
  }
}
