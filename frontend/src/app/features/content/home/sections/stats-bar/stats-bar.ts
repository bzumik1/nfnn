/// <reference types="@angular/localize" />

import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
} from '@angular/core';

const FOUNDED = { year: 2005, monthIndex: 9, day: 28 };
const COUNT_UP_MS = 1600;
const SHARE_IN_VIEW = 0.4;

interface Stat {
  readonly value: number;
  readonly suffix: string;
  readonly counts: boolean;
  readonly final: string;
  readonly label: string;
}

@Component({
  selector: 'app-stats-bar',
  templateUrl: './stats-bar.html',
  styleUrl: './stats-bar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatsBar {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly animates = canAnimate();
  private readonly progress = signal(this.animates ? 0 : 1);

  protected readonly stats: readonly Stat[] = [
    stat(fullYearsSinceFounding(new Date()), '', true, $localize`:@@home.stats.years:let pomáháme`),
    stat(200, '+', true, $localize`:@@home.stats.children:podpořených dětí`),
    stat(100, '%', true, $localize`:@@home.stats.transparent:transparentně`),
    stat(FOUNDED.year, '', false, $localize`:@@home.stats.founded:rok vzniku`),
  ];
  protected readonly waiting = signal(this.animates);
  protected readonly shown = computed(() => {
    const eased = easeOut(this.progress());
    return this.stats.map((stat) =>
      stat.counts ? `${Math.round(stat.value * eased)}${stat.suffix}` : stat.final,
    );
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (!this.animates) {
        return;
      }
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            observer.disconnect();
            this.countUp(destroyRef);
          }
        },
        { threshold: SHARE_IN_VIEW },
      );
      observer.observe(this.host.nativeElement);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  private countUp(destroyRef: DestroyRef): void {
    this.waiting.set(false);
    let start: number | undefined;
    let frame = 0;
    const step = (now: number) => {
      start ??= now;
      const progress = Math.min(1, (now - start) / COUNT_UP_MS);
      this.progress.set(progress);
      if (progress < 1) {
        frame = requestAnimationFrame(step);
      }
    };
    frame = requestAnimationFrame(step);
    destroyRef.onDestroy(() => cancelAnimationFrame(frame));
  }
}

function stat(value: number, suffix: string, counts: boolean, label: string): Stat {
  return { value, suffix, counts, final: `${value}${suffix}`, label };
}

function easeOut(progress: number): number {
  return 1 - (1 - progress) ** 3;
}

function canAnimate(): boolean {
  const reduced =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return !reduced && typeof IntersectionObserver === 'function';
}

function fullYearsSinceFounding(today: Date): number {
  const anniversaryPassed =
    today.getMonth() > FOUNDED.monthIndex ||
    (today.getMonth() === FOUNDED.monthIndex && today.getDate() >= FOUNDED.day);
  return today.getFullYear() - FOUNDED.year - (anniversaryPassed ? 0 : 1);
}
