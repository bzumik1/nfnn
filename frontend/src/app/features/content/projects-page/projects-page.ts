/// <reference types="@angular/localize" />

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map, Subscription } from 'rxjs';
import { whenShownAgain } from '../../../core/navigation/kept-tab-pages';
import { pluralCategory } from '../../../core/i18n/plural-category';
import { NeedsConnection } from '../../../shared/ui/needs-connection/needs-connection';
import { DonateBand } from '../donate-band/donate-band';
import { HomeApi } from '../home-api';
import { DonateBandPhotoResponse } from '../donate-band-api';
import { PROJECT_CATEGORIES, ProjectCategory, ProjectResponse } from '../projects-api';
import { PublishedStoriesStore } from './published-stories';
import { StoryTile } from './story-tile';

export const ALL_YEARS = 'vse';

type Choice = number | 'all';
type LoadState = 'loading' | 'ready' | 'error';

export interface YearGroup {
  readonly year: number;
  readonly items: readonly ProjectResponse[];
  readonly lookBack: string | null;
}

interface CategoryCount {
  readonly category: ProjectCategory;
  readonly count: number;
}

interface YearChip {
  readonly label: string;
  readonly choice: Choice;
  readonly href: string;
}

@Component({
  selector: 'app-projects-page',
  imports: [NeedsConnection, RouterLink, StoryTile, DonateBand],
  templateUrl: './projects-page.html',
  styleUrl: './projects-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectsPage {
  private readonly store = inject(PublishedStoriesStore);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private storiesLoad = Subscription.EMPTY;

  protected readonly state = signal<LoadState>(this.store.stories() ? 'ready' : 'loading');
  protected readonly bandPhoto = signal<DonateBandPhotoResponse | null>(null);

  private readonly asked = toSignal(
    inject(ActivatedRoute).queryParamMap.pipe(map((query) => choiceFrom(query.get('rok')))),
    { initialValue: null },
  );

  protected readonly projects = computed(() => this.store.stories()?.projects ?? []);

  protected readonly years = computed(() =>
    [...new Set(this.projects().map((item) => item.year))].sort((a, b) => b - a),
  );

  protected readonly choice = computed<Choice>(() => this.asked() ?? this.years()[0] ?? 'all');

  protected readonly announcement = linkedSignal<{ choice: Choice; shown: boolean }, string>({
    source: () => ({ choice: this.choice(), shown: this.years().length > 0 }),
    computation: (now, before) =>
      before !== undefined && before.source.shown && now.choice !== before.source.choice
        ? this.describe(now.choice)
        : (before?.value ?? ''),
  });

  protected readonly firstYear = computed(() => this.years().at(-1) ?? null);

  protected readonly categories = computed<CategoryCount[]>(() =>
    PROJECT_CATEGORIES.map((category) => ({
      category,
      count: this.projects().filter((item) => item.category === category).length,
    })).filter((entry) => entry.count > 0),
  );

  protected readonly chips = computed<YearChip[]>(() => [
    {
      label: $localize`:@@content.projects.chips.all:Vše`,
      choice: 'all',
      href: this.hrefOf('all'),
    },
    ...this.years().map((year) => ({ label: `${year}`, choice: year, href: this.hrefOf(year) })),
  ]);

  protected readonly groups = computed<YearGroup[]>(() => {
    const choice = this.choice();
    const lookBacks = this.store.stories()?.lookBacks ?? [];
    const years = choice === 'all' ? this.years() : [choice];
    return years.map((year) => ({
      year,
      items: this.projects().filter((item) => item.year === year),
      lookBack: lookBacks.find((lookBack) => lookBack.year === year)?.slug ?? null,
    }));
  });

  constructor() {
    this.load();
    whenShownAgain(() => {
      if (this.storiesLoad.closed) {
        this.load();
      }
    });
    inject(HomeApi)
      .load()
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (home) => this.bandPhoto.set(home.donateBand?.photo ?? null),
        error: () => this.bandPhoto.set(null),
      });
  }

  protected retry(): void {
    this.state.set('loading');
    this.load();
  }

  protected choose(event: MouseEvent, choice: Choice): void {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    if (choice === this.choice()) {
      return;
    }
    void this.router.navigateByUrl(this.hrefOf(choice), { scroll: 'manual' });
  }

  protected countOf(choice: Choice): number {
    return choice === 'all'
      ? this.projects().length
      : this.projects().filter((item) => item.year === choice).length;
  }

  private describe(choice: Choice): string {
    const count = this.countOf(choice);
    const stories = storiesWord(count);
    return choice === 'all'
      ? $localize`:@@content.projects.shown.all:Všechny roky: ${count}:count: ${stories}:stories:`
      : $localize`:@@content.projects.shown.year:Rok ${choice}:year:: ${count}:count: ${stories}:stories:`;
  }

  private hrefOf(choice: Choice): string {
    return this.router.serializeUrl(
      this.router.createUrlTree(['/projekty'], {
        queryParams: { rok: choice === 'all' ? ALL_YEARS : choice },
      }),
    );
  }

  private load(): void {
    this.storiesLoad.unsubscribe();
    this.storiesLoad = this.store
      .load()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.state.set('ready'),
        error: () => this.state.set(this.store.stories() ? 'ready' : 'error'),
      });
  }
}

function choiceFrom(value: string | null): Choice | null {
  if (value === ALL_YEARS) {
    return 'all';
  }
  const year = Number(value);
  return value !== null && Number.isInteger(year) && year > 0 ? year : null;
}

export function storiesWord(count: number): string {
  switch (pluralCategory(count)) {
    case 'one':
      return $localize`:@@content.projects.stories.one:příběh`;
    case 'few':
      return $localize`:@@content.projects.stories.few:příběhy`;
    default:
      return $localize`:@@content.projects.stories.other:příběhů`;
  }
}
