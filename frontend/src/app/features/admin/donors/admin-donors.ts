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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  map,
  merge,
  of,
  Subject,
  switchMap,
} from 'rxjs';
import { problemTypeEndsWith } from '../../../core/auth/api-problem';
import { AuthStore } from '../../../core/auth/auth-store';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { formatBankTime } from '../../donations/donation-date';
import { AdminApi, DonorAccountResponse } from '../admin-api';

type SearchState = 'idle' | 'searching' | 'ready' | 'error';

interface Outcome {
  state: SearchState;
  items: DonorAccountResponse[];
  hasMore: boolean;
}

const UNAUTHENTICATED = 'auth/unauthenticated';
const FORBIDDEN = 'auth/forbidden';
const SEARCH_DEBOUNCE_MS = 300;
const QUERY_PARAM = 'q';
const PRAGUE_DATE_LENGTH = '17. 10. 2026'.length;

@Component({
  selector: 'app-admin-donors',
  imports: [RouterLink],
  templateUrl: './admin-donors.html',
  styleUrl: './admin-donors.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDonors {
  private readonly api = inject(AdminApi);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly loginDialog = inject(LoginDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly title = viewChild.required<ElementRef<HTMLHeadingElement>>('title');
  private readonly queries = new Subject<string>();

  protected readonly query = signal('');
  protected readonly state = signal<SearchState>('idle');
  protected readonly results = signal<DonorAccountResponse[]>([]);
  protected readonly hasMore = signal(false);
  private readonly retries = new Subject<string>();

  constructor() {
    afterNextRender(() => this.title().nativeElement.focus(), { injector: this.injector });
    this.queries
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        map((query) => query.trim()),
        distinctUntilChanged(),
        (typed) => merge(typed, this.retries),
        switchMap((query) => this.lookUp(query)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((outcome) => {
        this.results.set(outcome.items);
        this.hasMore.set(outcome.hasMore);
        this.state.set(outcome.state);
      });
    const initial = this.route.snapshot.queryParamMap.get(QUERY_PARAM) ?? '';
    if (initial.trim() !== '') {
      this.query.set(initial);
      this.queries.next(initial);
    }
  }

  protected search(value: string): void {
    this.query.set(value);
    this.queries.next(value);
  }

  protected retry(): void {
    this.retries.next(this.query().trim());
  }

  protected registeredOn(item: DonorAccountResponse): string {
    return formatBankTime(item.registeredAt).slice(0, PRAGUE_DATE_LENGTH);
  }

  protected typeLabel(item: DonorAccountResponse): string {
    return item.type === 'COMPANY'
      ? $localize`:@@admin.donors.type.company:Firma`
      : $localize`:@@admin.donors.type.person:Osoba`;
  }

  private lookUp(query: string) {
    this.rememberInUrl(query);
    if (query === '') {
      return of<Outcome>({ state: 'idle', items: [], hasMore: false });
    }
    this.state.set('searching');
    return this.api.donors(query).pipe(
      map((response): Outcome => ({
        state: 'ready',
        items: response.items,
        hasMore: response.hasMore,
      })),
      catchError((failure: unknown) => {
        this.failed(failure);
        return of<Outcome>({ state: 'error', items: [], hasMore: false });
      }),
    );
  }

  private failed(failure: unknown): void {
    if (problemTypeEndsWith(failure, UNAUTHENTICATED)) {
      this.sendToSignIn();
      return;
    }
    if (problemTypeEndsWith(failure, FORBIDDEN)) {
      this.router.navigateByUrl('/darce/prehled');
    }
  }

  private rememberInUrl(query: string): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { [QUERY_PARAM]: query === '' ? null : query },
      replaceUrl: true,
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
