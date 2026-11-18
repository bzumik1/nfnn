import {
  afterNextRender,
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CompactLayout } from '../../../../../core/layout/compact-layout';
import { ShortViewport } from '../../../../../core/layout/short-viewport';
import { SYSTEM_TEXT_SIZE_CLASS } from '../../../../../core/zoom/system-text-size';
import { StatsBar } from '../stats-bar/stats-bar';

const RETURN_HYSTERESIS_PX = 24;
const FACE_LEFT_IN_PHOTO = 0.43;
const LEAD_NARROWEST_EM = 18;
const BROWSER_TEXT_PX = 16;
const SYSTEM_TEXT_PX = 17;
const LARGEST_TEXT_KEEPING_FACE_CLEAR = 2;

interface Shade {
  leadEnd: number;
  shadeEnd: number;
}

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
  private readonly photo = viewChild.required<ElementRef<HTMLImageElement>>('photo');
  private readonly lead = viewChild.required<ElementRef<HTMLElement>>('lead');
  private readonly content = viewChild.required<ElementRef<HTMLElement>>('content');
  private readonly fullScreen = viewChild.required<ElementRef<HTMLElement>>('fullScreen');
  private readonly tabBarStrip = viewChild.required<ElementRef<HTMLElement>>('tabBarStrip');
  private readonly shadeFade = viewChild.required<ElementRef<HTMLElement>>('shadeFade');
  private readonly buttons = viewChild<ElementRef<HTMLElement>>('buttons');
  private readonly crowded = signal(false);
  protected readonly buttonsDrop = signal(0);
  protected readonly leadWidthBesideFace = signal<number | null>(null);
  private leadCappedAtWidth = 0;
  private leadOverFace = false;
  protected readonly shade = signal<Shade | null>(null, {
    equal: (a, b) => a?.leadEnd === b?.leadEnd && a?.shadeEnd === b?.shadeEnd,
  });
  private figuresRowGrowth = 0;
  protected readonly showsDonate = computed(() => !this.short());
  protected readonly showsWhereWeHelp = computed(() => !this.compact() && !this.short());
  protected readonly showsFigures = computed(() => this.showsWhereWeHelp() && !this.crowded());

  constructor() {
    let release: (() => void) | undefined;
    afterNextRender(() => {
      release = this.keepButtonsAboveTabBar();
    });
    afterRenderEffect(() => {
      this.showsDonate();
      this.showsFigures();
      this.leadWidthBesideFace();
      untracked(() => this.fitAboveTabBar());
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
    return () => {
      view.cancelAnimationFrame(frame);
      observer?.disconnect();
      view.removeEventListener('resize', refit);
    };
  }

  private fitAboveTabBar(): void {
    const content = this.content().nativeElement;
    const room = this.fullScreen().nativeElement.offsetHeight;
    const contentHeight = content.offsetHeight - this.buttonsDrop();
    const figures = content.querySelector<HTMLElement>(':scope > .hero-figures');
    if (figures) {
      const buttons = content.querySelector<HTMLElement>(':scope > .hero-btns');
      this.figuresRowGrowth = Math.max(0, figures.offsetHeight - (buttons?.offsetHeight ?? 0));
      if (contentHeight > room) {
        this.crowded.set(true);
        return;
      }
    } else if (
      this.crowded() &&
      contentHeight + this.figuresRowGrowth <= room - RETURN_HYSTERESIS_PX
    ) {
      this.crowded.set(false);
    }
    this.keepLeadBesideFace(content);
    this.keepButtonsOutOfTabBarStrip(room, contentHeight);
  }

  private keepLeadBesideFace(content: HTMLElement): void {
    if (!this.crowded()) {
      this.leadCappedAtWidth = 0;
      this.leadOverFace = false;
      this.leadWidthBesideFace.set(null);
      this.shade.set(null);
      return;
    }
    const lead = this.lead().nativeElement;
    const fade = this.shadeFade().nativeElement.offsetWidth;
    const leadLeft = content.offsetLeft + lead.offsetLeft;
    const besideFace = Math.max(0, Math.floor(this.faceLeft() - fade - leadLeft));
    const narrowest = LEAD_NARROWEST_EM * parseFloat(getComputedStyle(lead).fontSize);
    const margin = this.leadOverFace ? RETURN_HYSTERESIS_PX : 0;
    this.leadOverFace = this.textBeyondKeepingFaceClear() && besideFace < narrowest + margin;
    if (this.leadOverFace) {
      this.leadCappedAtWidth = 0;
      this.leadWidthBesideFace.set(null);
      const leadEnd = leadLeft + lead.offsetWidth;
      this.shade.set({ leadEnd, shadeEnd: leadEnd + fade });
      return;
    }
    const width = this.hero().nativeElement.offsetWidth;
    const kept = this.leadCappedAtWidth === width ? this.leadWidthBesideFace() : null;
    const cap = Math.min(kept ?? besideFace, besideFace);
    this.leadCappedAtWidth = width;
    this.leadWidthBesideFace.set(cap);
    this.shade.set({ leadEnd: leadLeft + cap, shadeEnd: leadLeft + cap + fade });
  }

  private faceLeft(): number {
    const photo = this.photo().nativeElement;
    const aspect = Number(photo.getAttribute('width')) / Number(photo.getAttribute('height'));
    const photoWidth = Math.max(photo.offsetWidth, photo.offsetHeight * aspect);
    return (
      photo.offsetLeft + (photo.offsetWidth - photoWidth) / 2 + FACE_LEFT_IN_PHOTO * photoWidth
    );
  }

  private textBeyondKeepingFaceClear(): boolean {
    const root = this.hero().nativeElement.ownerDocument.documentElement;
    const usual = root.classList.contains(SYSTEM_TEXT_SIZE_CLASS)
      ? SYSTEM_TEXT_PX
      : BROWSER_TEXT_PX;
    return parseFloat(getComputedStyle(root).fontSize) > usual * LARGEST_TEXT_KEEPING_FACE_CLEAR;
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
