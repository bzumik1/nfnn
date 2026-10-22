import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AuthStore } from '../../../core/auth/auth-store';
import { Hero } from './sections/hero/hero';
import { StatsBar } from './sections/stats-bar/stats-bar';
import { About } from './sections/about/about';
import { Projects } from './sections/projects/projects';
import { DonateCta } from './sections/donate-cta/donate-cta';
import { News } from './sections/news/news';
import { ContactForm } from '../../contact/contact-form/contact-form';

@Component({
  selector: 'app-home',
  imports: [Hero, StatsBar, About, Projects, DonateCta, News, ContactForm],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {
  private readonly auth = inject(AuthStore);

  protected readonly variableSymbol = computed(() => this.auth.donor()?.variableSymbol ?? null);
}
