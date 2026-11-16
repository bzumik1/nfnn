/// <reference types="@angular/localize" />

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  DOCUMENT,
  ElementRef,
  inject,
  Injectable,
  input,
  linkedSignal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Reveal } from '../../../../../shared/ui/reveal/reveal';

const FOUNDED = { year: 2005, monthIndex: 9, day: 28 };
const COUNT_FROM = 0.7;
const FIGURES_PER_ROW = 2;

interface Stat {
  readonly value: number;
  readonly suffix: string;
  readonly counts: boolean;
  readonly final: string;
  readonly label: string;
}

@Injectable({ providedIn: 'root' })
export class StatsCountUp {
  counted = false;
}

@Component({
  selector: 'app-stats-bar',
  imports: [NgTemplateOutlet, Reveal],
  templateUrl: './stats-bar.html',
  styleUrl: './stats-bar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:beforeprint)': 'standAtValues()',
  },
})
export class StatsBar {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly countUp = inject(StatsCountUp);
  readonly ownEntrance = input(true);
  private readonly motionAllowed = canCount(this.document.defaultView) && !this.countUp.counted;
  private readonly animates = computed(() => this.ownEntrance() && this.motionAllowed);
  private readonly running: (() => void)[] = [];

  protected readonly stats: readonly Stat[] = [
    stat(fullYearsSinceFounding(new Date()), '', true, $localize`:@@home.stats.years:let pomáháme`),
    stat(200, '+', true, $localize`:@@home.stats.children:podpořených dětí`),
    stat(100, '%', false, $localize`:@@home.stats.transparent:transparentně`),
    stat(FOUNDED.year, '', false, $localize`:@@home.stats.founded:rok vzniku`),
  ];
  private readonly progress = linkedSignal<readonly number[]>(() =>
    this.stats.map(() => (this.animates() ? 0 : 1)),
  );
  protected readonly shown = computed(() =>
    this.stats.map((stat, order) => {
      if (!stat.counts) {
        return stat.final;
      }
      const share = COUNT_FROM + (1 - COUNT_FROM) * this.progress()[order];
      return `${Math.round(stat.value * share)}${stat.suffix}`;
    }),
  );

  protected standAtValues(): void {
    this.running.splice(0).forEach((stop) => stop());
    this.progress.set(this.stats.map(() => 1));
  }

  protected row(order: number): number {
    return Math.floor(order / FIGURES_PER_ROW);
  }

  protected countUpOnce(order: number): void {
    if (!this.animates() || !this.stats[order].counts || this.progress()[order] === 1) {
      return;
    }
    const view = this.document.defaultView;
    const duration = view === null ? 0 : this.countMs(view);
    if (view === null || duration <= 0) {
      this.setProgress(order, 1);
      return;
    }
    this.countUp.counted = true;
    const count = this.host.nativeElement.animate([], {
      duration,
      easing: this.token(view, '--ease-out') || 'ease-out',
      fill: 'forwards',
    });
    let frame = 0;
    const step = () => {
      const progress = Number(count.effect?.getComputedTiming().progress ?? 1);
      this.setProgress(order, progress);
      if (progress < 1) {
        frame = requestAnimationFrame(step);
      }
    };
    frame = requestAnimationFrame(step);
    const stop = () => {
      cancelAnimationFrame(frame);
      count.cancel();
    };
    this.running.push(stop);
    this.destroyRef.onDestroy(stop);
  }

  private setProgress(order: number, progress: number): void {
    this.progress.update((all) => all.map((value, at) => (at === order ? progress : value)));
  }

  private countMs(view: Window): number {
    const token = this.token(view, '--duration-count');
    const value = Number.parseFloat(token);
    if (!Number.isFinite(value)) {
      return 0;
    }
    return token.endsWith('ms') ? value : value * 1000;
  }

  private token(view: Window, name: string): string {
    return view.getComputedStyle(this.document.documentElement).getPropertyValue(name).trim();
  }
}

function stat(value: number, suffix: string, counts: boolean, label: string): Stat {
  return { value, suffix, counts, final: `${value}${suffix}`, label };
}

function canCount(view: Window | null): boolean {
  if (view === null) {
    return false;
  }
  const reduced =
    typeof view.matchMedia === 'function' &&
    view.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return (
    !reduced &&
    typeof IntersectionObserver === 'function' &&
    typeof Element.prototype.animate === 'function'
  );
}

function fullYearsSinceFounding(today: Date): number {
  const anniversaryPassed =
    today.getMonth() > FOUNDED.monthIndex ||
    (today.getMonth() === FOUNDED.monthIndex && today.getDate() >= FOUNDED.day);
  return today.getFullYear() - FOUNDED.year - (anniversaryPassed ? 0 : 1);
}
