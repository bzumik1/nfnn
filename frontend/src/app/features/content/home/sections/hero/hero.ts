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
  private readonly fullScreen = viewChild.required<ElementRef<HTMLElement>>('fullScreen');
  private readonly tabBarStrip = viewChild.required<ElementRef<HTMLElement>>('tabBarStrip');
  private readonly buttons = viewChild<ElementRef<HTMLElement>>('buttons');
  private readonly crowded = signal(false);
  protected readonly buttonsDrop = signal(0);
  private figuresRowGrowth = 0;
  protected readonly showsDonate = computed(() => !this.short());
  protected readonly showsWhereWeHelp = computed(() => !this.compact() && !this.short());
  protected readonly showsFigures = computed(() => this.showsWhereWeHelp() && !this.crowded());

  constructor() {
    let release: (() => void) | undefined;
    afterNextRender(() => {
      release = this.keepButtonsAboveTabBar();
    });
    inject(DestroyRef).onDestroy(() => release?.());
  }

  private keepButtonsAboveTabBar(): () => void {
    const content = this.content().nativeElement;
    const view = content.ownerDocument.defaultView;
    if (!view) {
      return () => undefined;
    }
    let frame = 0;
    const refit = () => {
      view.cancelAnimationFrame(frame);
      frame = view.requestAnimationFrame(() => this.fitAboveTabBar());
    };
    const observer = view.ResizeObserver ? new view.ResizeObserver(refit) : null;
    for (const observed of [content, this.hero().nativeElement, this.fullScreen().nativeElement]) {
      observer?.observe(observed, { box: 'border-box' });
    }
    view.addEventListener('resize', refit);
    this.fitAboveTabBar();
    return () => {
      view.cancelAnimationFrame(frame);
      observer?.disconnect();
      view.removeEventListener('resize', refit);
    };
  }

  private fitAboveTabBar(): void {
    const content = this.content().nativeElement;
    const room = this.fullScreen().nativeElement.offsetHeight;
    const drop = this.buttonsDrop();
    const contentHeight = content.offsetHeight - drop;
    this.keepButtonsOutOfTabBarStrip(room, contentHeight);
    const figures = content.querySelector<HTMLElement>(':scope > .hero-figures');
    if (figures) {
      const buttons = content.querySelector<HTMLElement>(':scope > .hero-btns');
      this.figuresRowGrowth = Math.max(0, figures.offsetHeight - (buttons?.offsetHeight ?? 0));
      if (contentHeight > room) {
        this.crowded.set(true);
      }
      return;
    }
    if (this.crowded() && contentHeight + this.figuresRowGrowth <= room - RETURN_HYSTERESIS_PX) {
      this.crowded.set(false);
    }
  }

  private keepButtonsOutOfTabBarStrip(room: number, contentHeight: number): void {
    const buttons = this.buttons()?.nativeElement;
    if (!buttons) {
      this.buttonsDrop.set(0);
      return;
    }
    const drop = this.buttonsDrop();
    const contentTop = Math.max(0, room - contentHeight);
    const top = contentTop + buttons.offsetTop - drop;
    const bottom = top + buttons.offsetHeight;
    const stripTop = this.tabBarStrip().nativeElement.offsetTop;
    const stripEdge = drop > 0 ? stripTop - RETURN_HYSTERESIS_PX : stripTop;
    const reachesStrip = bottom > stripEdge && top < room;
    this.buttonsDrop.set(reachesStrip ? room - top : 0);
  }
}
