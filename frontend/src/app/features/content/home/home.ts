import { Component } from '@angular/core';
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
})
export class Home {}
