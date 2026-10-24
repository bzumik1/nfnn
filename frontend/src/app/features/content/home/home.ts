import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthStore } from '../../../core/auth/auth-store';
import { ContactForm } from '../../contact/contact-form/contact-form';
import { HomeApi, HomeResponse } from '../home-api';
import { About } from './sections/about/about';
import { DonateCta } from './sections/donate-cta/donate-cta';
import { Hero } from './sections/hero/hero';
import { News } from './sections/news/news';
import { Projects } from './sections/projects/projects';
import { StatsBar } from './sections/stats-bar/stats-bar';

@Component({
  selector: 'app-home',
  imports: [Hero, StatsBar, About, Projects, DonateCta, News, ContactForm],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {
  private readonly auth = inject(AuthStore);
  private readonly homeApi = inject(HomeApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly variableSymbol = computed(() => this.auth.donor()?.variableSymbol ?? null);
  protected readonly donorName = computed(() => this.auth.donor()?.name ?? null);
  protected readonly content = signal<HomeResponse | null>(null);
  protected readonly news = computed(() => this.content()?.news ?? []);
  protected readonly projects = computed(() => this.content()?.projects ?? []);

  constructor() {
    this.homeApi
      .load()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (content) => this.content.set(content),
        error: () => this.content.set(null),
      });
  }
}
