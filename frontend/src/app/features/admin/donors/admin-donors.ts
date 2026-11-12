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
import { CompactLayout } from '../../../core/layout/compact-layout';
import { Avatar } from '../../../shared/ui/avatar/avatar';
import { PeopleApi, PersonResponse } from '../../content/people-api';
import { formatMinorUnits } from '../../donations/donation-amount';
import { formatDonationDate, pragueDay } from '../../donations/donation-date';
import { AdminApi, DonorAccountResponse } from '../admin-api';
import { AdministrationCopy } from '../device-copy/administration-copy';
import { portraitsByEmail } from '../people/portraits-by-email';
import { type CopiedGift, type LastGift, recentDonors } from './recent-donors';

type SearchState = 'idle' | 'searching' | 'ready' | 'error';

interface ListedDonor {
  account: DonorAccountResponse;
  lastGift: LastGift | null;
}

interface Outcome {
  state: SearchState;
  items: DonorAccountResponse[];
  hasMore: boolean;
}

const UNAUTHENTICATED = 'auth/unauthenticated';
const FORBIDDEN = 'auth/forbidden';
const SEARCH_DEBOUNCE_MS = 300;
const QUERY_PARAM = 'q';
const RECENT_DONORS_SHOWN = 10;

@Component({
  selector: 'app-admin-donors',
  imports: [RouterLink, Avatar],
  templateUrl: './admin-donors.html',
  styleUrl: './admin-donors.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDonors {
  private readonly api = inject(AdminApi);
  private readonly people = inject(PeopleApi);
  private readonly copy = inject(AdministrationCopy);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly loginDialog = inject(LoginDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly title = viewChild.required<ElementRef<HTMLHeadingElement>>('title');
  private readonly queries = new Subject<string>();
  protected readonly rows = inject(CompactLayout).listsAsRows;

  protected readonly query = signal('');
  protected readonly state = signal<SearchState>('idle');
  protected readonly results = signal<DonorAccountResponse[]>([]);
  protected readonly hasMore = signal(false);
  private readonly retries = new Subject<string>();
  private readonly members = signal<PersonResponse[]>([]);
  private readonly portraits = computed(() => portraitsByEmail(this.members()));
  private readonly copiedGifts = this.copy.rows<CopiedGift>('donations', 'donations');
  private readonly copiedAccounts = this.copy.rows<DonorAccountResponse>('donors', 'accounts');

  protected readonly recent = computed<ListedDonor[]>(() => {
    const gifts = this.copiedGifts();
    const accounts = this.copiedAccounts();
    if (gifts === null || accounts === null) {
      return [];
    }
    return recentDonors(gifts, accounts, RECENT_DONORS_SHOWN);
  });
  protected readonly listsRecent = computed(
    () => this.state() === 'idle' && this.recent().length > 0,
  );
  protected readonly listed = computed<ListedDonor[]>(() => {
    if (this.listsRecent()) {
      return this.recent();
    }
    if (this.state() === 'ready') {
      return this.results().map((account) => ({ account, lastGift: null }));
    }
    return [];
  });

  constructor() {
    this.loadPortraits();
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
    return formatDonationDate(pragueDay(item.registeredAt));
  }

  protected portraitOf(item: DonorAccountResponse): string | null {
    return item.erasedAt ? null : (this.portraits().get(item.email) ?? null);
  }

  protected giftAmount(gift: LastGift): string {
    return formatMinorUnits(gift.amountMinor);
  }

  protected giftDay(gift: LastGift): string {
    return formatDonationDate(gift.receivedAt);
  }

  protected typeLabel(item: DonorAccountResponse): string {
    return item.type === 'COMPANY'
      ? $localize`:@@admin.donors.type.company:Firma`
      : $localize`:@@admin.donors.type.person:Osoba`;
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
