import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  linkedSignal,
  output,
  untracked,
  viewChild,
} from '@angular/core';
import { CompactLayout } from '../../../core/layout/compact-layout';
import { motionAllowed, PageTransitions } from '../../../core/navigation/page-transitions';

const FADE_DURATION = '--duration-fast';
const FADE_EASE = '--ease-standard';

@Component({
  selector: 'app-sheet-head',
  templateUrl: './sheet-head.html',
  styleUrl: './sheet-head.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SheetHead {
  readonly title = input.required<string>();
  readonly lateTitle = input<string | null>(null);
  readonly titleId = input<string | null>(null);
  readonly backPressed = output<void>();
  readonly closePressed = output<void>();

  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly stepping = inject(PageTransitions).stepping;
  private readonly compact = inject(CompactLayout).isCompact;
  private readonly shownTitle = viewChild<ElementRef<HTMLElement>>('shownTitle');
  protected readonly shown = linkedSignal(() => this.title());
  private fades: Animation[] = [];
  private fadingTo: string | null = null;

  constructor() {
    effect(() => {
      this.title();
      untracked(() => this.letFadeGo());
    });
    effect(() => {
      const late = this.lateTitle();
      const stepping = this.stepping();
      const compact = this.compact();
      untracked(() => this.follow(late, stepping, compact));
    });
  }

  private follow(late: string | null, stepping: boolean, compact: boolean): void {
    if (late === null) {
      return;
    }
    if (!compact) {
      this.letFadeGo();
      this.shown.set(late);
      return;
    }
    if (stepping || late === this.shown() || late === this.fadingTo) {
      return;
    }
    this.fadeTo(late);
  }

  private fadeTo(late: string): void {
    const element = this.shownTitle()?.nativeElement;
    const view = this.document.defaultView;
    if (
      element === undefined ||
      view === null ||
      typeof element.animate !== 'function' ||
      !motionAllowed(view)
    ) {
      this.letFadeGo();
      this.shown.set(late);
      return;
    }
    this.letFadeGo();
    const timing = this.fadeTiming(view);
    const out = element.animate([{ opacity: 1 }, { opacity: 0 }], { ...timing, fill: 'forwards' });
    this.fades = [out];
    this.fadingTo = late;
    out.finished
      .then(() => {
        if (this.fadingTo !== late) {
          return;
        }
        this.shown.set(late);
        afterNextRender(
          () => {
            if (this.fadingTo !== late) {
              return;
            }
            const into = element.animate([{ opacity: 0 }, { opacity: 1 }], timing);
            out.cancel();
            this.fades = [into];
            void into.finished.then(
              () => this.fadeEnded(late),
              () => this.fadeEnded(late),
            );
          },
          { injector: this.injector },
        );
      })
      .catch(() => this.fadeEnded(late));
  }

  private fadeTiming(view: Window): KeyframeAnimationOptions {
    const root = view.getComputedStyle(this.document.documentElement);
    const token = root.getPropertyValue(FADE_DURATION).trim();
    const value = Number.parseFloat(token);
    const duration = Number.isFinite(value) ? (token.endsWith('ms') ? value : value * 1000) : 0;
    const easing = root.getPropertyValue(FADE_EASE).trim();
    return { duration: duration / 2, ...(easing === '' ? {} : { easing }) };
  }

  private fadeEnded(late: string): void {
    if (this.fadingTo === late) {
      this.fadingTo = null;
      this.fades = [];
    }
  }

  private letFadeGo(): void {
    this.fadingTo = null;
    this.fades.splice(0).forEach((fade) => fade.cancel());
  }
}
