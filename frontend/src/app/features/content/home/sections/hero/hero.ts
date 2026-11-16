import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CompactLayout } from '../../../../../core/layout/compact-layout';
import { ShortViewport } from '../../../../../core/layout/short-viewport';
import { StatsBar } from '../stats-bar/stats-bar';

const HIDDEN_BY_CROWDING = [[], ['hides-lead'], ['hides-lead', 'hides-figures']] as const;
const MOST_CROWDED = HIDDEN_BY_CROWDING.length - 1;
const RETURN_HYSTERESIS_PX = 24;

@Component({
  selector: 'app-hero',
  imports: [RouterLink, StatsBar],
  templateUrl: './hero.html',
  styleUrl: './hero.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Hero {
  private readonly compact = inject(CompactLayout).isCompact;
  private readonly short = inject(ShortViewport).isShort;
  private readonly hero = viewChild.required<ElementRef<HTMLElement>>('hero');
  private readonly content = viewChild.required<ElementRef<HTMLElement>>('content');
  private readonly crowding = signal(0);
  protected readonly showsDonate = computed(() => !this.short());
  protected readonly showsWhereWeHelp = computed(() => !this.compact() && !this.short());
  protected readonly showsFigures = this.showsWhereWeHelp;
  protected readonly hidesLead = computed(() => this.crowding() >= 1);
  protected readonly hidesFigures = computed(() => this.crowding() >= 2);

  constructor() {
    let release: (() => void) | undefined;
    afterNextRender(() => {
      release = this.keepContentAboveTabBar();
    });
    inject(DestroyRef).onDestroy(() => release?.());
  }

  private keepContentAboveTabBar(): () => void {
    const content = this.content().nativeElement;
    const view = content.ownerDocument.defaultView;
    if (!view) {
      return () => undefined;
    }
    this.fitAboveTabBar(view);
    let frame = 0;
    const refit = () => {
      view.cancelAnimationFrame(frame);
      frame = view.requestAnimationFrame(() => this.fitAboveTabBar(view));
    };
    const observer = view.ResizeObserver ? new view.ResizeObserver(refit) : null;
    observer?.observe(content);
    view.addEventListener('resize', refit);
    return () => {
      view.cancelAnimationFrame(frame);
      observer?.disconnect();
      view.removeEventListener('resize', refit);
    };
  }

  private fitAboveTabBar(view: Window): void {
    const content = this.content().nativeElement;
    const room = this.roomAboveTabBar(view);
    const current = this.crowding();
    const heightAt = (crowding: number) => {
      this.hideFor(content, crowding);
      return content.offsetHeight;
    };
    let crowding = current;
    while (crowding < MOST_CROWDED && heightAt(crowding) > room) {
      crowding++;
    }
    if (crowding === current) {
      while (crowding > 0 && heightAt(crowding - 1) <= room - RETURN_HYSTERESIS_PX) {
        crowding--;
      }
    }
    this.hideFor(content, current);
    this.crowding.set(crowding);
  }

  private roomAboveTabBar(view: Window): number {
    const fullScreen = parseFloat(view.getComputedStyle(this.hero().nativeElement).minHeight);
    return Number.isFinite(fullScreen) && fullScreen > 0 ? fullScreen : view.innerHeight;
  }

  private hideFor(content: HTMLElement, crowding: number): void {
    const hidden: readonly string[] = HIDDEN_BY_CROWDING[crowding];
    for (const name of HIDDEN_BY_CROWDING[MOST_CROWDED]) {
      content.classList.toggle(name, hidden.includes(name));
    }
  }
}
