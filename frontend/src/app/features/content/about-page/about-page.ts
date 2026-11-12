import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { whenShownAgain } from '../../../core/navigation/kept-tab-pages';
import { ContactForm } from '../../contact/contact-form/contact-form';
import { HomeApi, HomeResponse } from '../home-api';
import { About } from '../home/sections/about/about';
import { DonateBand } from '../donate-band/donate-band';

@Component({
  selector: 'app-about-page',
  imports: [About, DonateBand, ContactForm],
  templateUrl: './about-page.html',
  styleUrl: './about-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AboutPage {
  protected readonly content = signal<HomeResponse | null>(null);
  protected readonly aboutPhoto = computed(() => this.content()?.about?.photo ?? null);
  protected readonly people = computed(() => this.content()?.people ?? null);
  protected readonly bandPhoto = computed(() => this.content()?.donateBand?.photo ?? null);

  private readonly homeApi = inject(HomeApi);
  private contentLoad = Subscription.EMPTY;

  constructor() {
    this.load();
    whenShownAgain(() => this.load());
    inject(DestroyRef).onDestroy(() => this.contentLoad.unsubscribe());
  }

  private load(): void {
    this.contentLoad.unsubscribe();
    this.contentLoad = this.homeApi.load().subscribe({
      next: (content) => this.content.set(content),
      error: () => undefined,
    });
  }
}
