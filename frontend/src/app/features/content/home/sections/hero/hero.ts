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
const FACE_IN_PHOTO: Box = { left: 0.43, right: 0.59, top: 0.19, bottom: 0.52 };
const LEAD_NARROWEST_EM = 18;
const BROWSER_TEXT_PX = 16;
const SYSTEM_TEXT_PX = 17;
const LARGEST_TEXT_KEEPING_FACE_CLEAR = 2;

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

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
  private crowdedByFaceAt: string | null = null;
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
    const shift = this.buttonsShift();
    const contentHeight = content.offsetHeight - shift;
    const figures = content.querySelector<HTMLElement>(':scope > .hero-figures');
    const fit = this.fitKey(room);
    if (figures) {
      const buttons = content.querySelector<HTMLElement>(':scope > .hero-btns');
      this.figuresRowGrowth = Math.max(0, figures.offsetHeight - (buttons?.offsetHeight ?? 0));
      const leadMeetsFace = this.leadMeetsFace(content);
      if (contentHeight > room || leadMeetsFace) {
        this.crowdedByFaceAt = leadMeetsFace ? fit : null;
        this.crowded.set(true);
        return;
      }
    } else if (
      this.crowded() &&
      this.crowdedByFaceAt !== fit &&
      contentHeight + this.figuresRowGrowth <= room - RETURN_HYSTERESIS_PX
    ) {
      this.crowdedByFaceAt = null;
      this.crowded.set(false);
    }
    this.keepLeadBesideFace(content);
    this.keepButtonsOutOfTabBarStrip(room, contentHeight, shift);
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
    const besideFace = Math.max(0, Math.floor(this.faceBox().left - fade - leadLeft));
    const narrowest = LEAD_NARROWEST_EM * parseFloat(getComputedStyle(lead).fontSize);
    const margin = this.leadOverFace ? RETURN_HYSTERESIS_PX : 0;
    this.leadOverFace = this.textBeyondKeepingFaceClear() && besideFace < narrowest + margin;
    if (this.leadOverFace) {
      this.leadCappedAtWidth = 0;
      this.leadWidthBesideFace.set(null);
      const leadEnd = leadLeft + lead.offsetWidth;
      this.shade.set(this.shadeOverFace(leadEnd, fade));
      return;
    }
    const width = this.hero().nativeElement.offsetWidth;
    const kept = this.leadCappedAtWidth === width ? this.leadWidthBesideFace() : null;
    const cap = Math.min(kept ?? besideFace, besideFace);
    this.leadCappedAtWidth = width;
    this.leadWidthBesideFace.set(cap);
    this.shade.set({ leadEnd: leadLeft + cap, shadeEnd: leadLeft + cap + fade });
  }

  private shadeOverFace(leadEnd: number, fade: number): Shade {
    if (leadEnd + fade < this.faceBox().right) {
      return { leadEnd, shadeEnd: leadEnd + fade };
    }
    const width = this.hero().nativeElement.offsetWidth;
    return { leadEnd: width, shadeEnd: width + fade };
  }

  private fitKey(room: number): string {
    const root = this.hero().nativeElement.ownerDocument.documentElement;
    const width = this.hero().nativeElement.offsetWidth;
    return `${width}:${room}:${getComputedStyle(root).fontSize}`;
  }

  private leadMeetsFace(content: HTMLElement): boolean {
    const lead = this.lead().nativeElement;
    if (lead.offsetWidth <= 1 || lead.offsetHeight <= 1) {
      return false;
    }
    const words = lead.ownerDocument.createRange();
    words.selectNodeContents(lead);
    const heroLeft = this.hero().nativeElement.getBoundingClientRect().left;
    const wordsBox = words.getBoundingClientRect();
    const top = content.offsetTop + lead.offsetTop;
    const face = this.faceBox();
    return (
      wordsBox.left - heroLeft < face.right &&
      face.left < wordsBox.right - heroLeft &&
      top < face.bottom &&
      face.top < top + lead.offsetHeight
    );
  }

  private faceBox(): Box {
    const photo = this.photo().nativeElement;
    const aspect = Number(photo.getAttribute('width')) / Number(photo.getAttribute('height'));
    const width = Math.max(photo.offsetWidth, photo.offsetHeight * aspect);
    const height = width / aspect;
    const [focusX, focusY] = getComputedStyle(photo)
      .objectPosition.split(' ')
      .map((part) => parseFloat(part) / 100);
    const left = photo.offsetLeft + (photo.offsetWidth - width) * focusX;
    const top = photo.offsetTop + (photo.offsetHeight - height) * focusY;
    return {
      left: left + FACE_IN_PHOTO.left * width,
      right: left + FACE_IN_PHOTO.right * width,
      top: top + FACE_IN_PHOTO.top * height,
      bottom: top + FACE_IN_PHOTO.bottom * height,
    };
  }

  private textBeyondKeepingFaceClear(): boolean {
    const root = this.hero().nativeElement.ownerDocument.documentElement;
    const usual = root.classList.contains(SYSTEM_TEXT_SIZE_CLASS)
      ? SYSTEM_TEXT_PX
      : BROWSER_TEXT_PX;
    return parseFloat(getComputedStyle(root).fontSize) > usual * LARGEST_TEXT_KEEPING_FACE_CLEAR;
  }

  private keepButtonsOutOfTabBarStrip(room: number, contentHeight: number, shift: number): void {
    const buttons = this.buttons()?.nativeElement;
    if (!buttons) {
      this.buttonsDrop.set(0);
      return;
    }
    const contentTop = Math.max(0, room - contentHeight);
    const top = contentTop + buttons.offsetTop - shift;
    const bottom = top + buttons.offsetHeight;
    const stripTop = this.tabBarStrip().nativeElement.offsetTop;
    const stripEdge = this.buttonsDrop() > 0 ? stripTop - RETURN_HYSTERESIS_PX : stripTop;
    const reachesStrip = bottom > stripEdge && top < room;
    this.buttonsDrop.set(reachesStrip ? this.marginAbove(buttons) + room - top : 0);
  }

  private buttonsShift(): number {
    const buttons = this.buttons()?.nativeElement;
    const drop = this.buttonsDrop();
    if (!buttons || drop === 0) {
      return 0;
    }
    const above = this.inFlowBefore(buttons);
    if (!above) {
      return drop;
    }
    const gap = buttons.offsetTop - (above.offsetTop + above.offsetHeight);
    return Math.max(0, gap - this.marginAbove(buttons));
  }

  private marginAbove(element: HTMLElement): number {
    const above = this.inFlowBefore(element);
    return above ? parseFloat(getComputedStyle(above).marginBottom) : 0;
  }

  private inFlowBefore(element: HTMLElement): HTMLElement | null {
    let sibling = element.previousElementSibling;
    while (sibling instanceof HTMLElement && getComputedStyle(sibling).position === 'absolute') {
      sibling = sibling.previousElementSibling;
    }
    return sibling instanceof HTMLElement ? sibling : null;
  }
}
