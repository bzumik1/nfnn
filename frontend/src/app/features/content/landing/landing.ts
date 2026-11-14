import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  DOCUMENT,
  ElementRef,
  inject,
} from '@angular/core';
import { Hero } from '../home/sections/hero/hero';
import { holdLandingStage } from './landing-stage';

@Component({
  selector: 'app-landing',
  imports: [Hero],
  templateUrl: './landing.html',
  styleUrl: './landing.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Landing {
  constructor() {
    const document = inject(DOCUMENT);
    const host = inject<ElementRef<HTMLElement>>(ElementRef);
    let release: (() => void) | null = null;
    afterNextRender(() => {
      const hero = host.nativeElement.querySelector<HTMLElement>('#uvod');
      if (hero !== null) {
        release = holdLandingStage(document, hero);
      }
    });
    inject(DestroyRef).onDestroy(() => release?.());
  }
}
