import { DOCUMENT } from '@angular/common';
import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';

import { Title } from '@angular/platform-browser';

import { ChunkLoadRecovery } from '../../core/reload/chunk-load-recovery';

const ROOM_CLASS = 'has-floating-notice';
const ROOM_HEIGHT = '--floating-notice-height';

@Component({
  selector: 'app-chunk-load-notice',
  templateUrl: './chunk-load-notice.html',
  styleUrl: './chunk-load-notice.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChunkLoadNotice {
  protected readonly recovery = inject(ChunkLoadRecovery);
  private readonly document = inject(DOCUMENT);
  private readonly title = inject(Title);
  private readonly bar = viewChild<ElementRef<HTMLElement>>('bar');
  private readonly barButton = viewChild<ElementRef<HTMLButtonElement>>('barButton');
  private readonly pageHeading = viewChild<ElementRef<HTMLElement>>('pageHeading');

  constructor() {
    afterRenderEffect(() => this.barButton()?.nativeElement.focus());
    afterRenderEffect(() => {
      const heading = this.pageHeading()?.nativeElement;
      if (heading) {
        this.title.setTitle(
          $localize`:@@layout.chunk-load.pageTitle:Stránku se nepodařilo otevřít | Nová naděje – nadační fond`,
        );
        heading.focus();
      }
    });
    afterRenderEffect((onCleanup) => {
      const bar = this.bar()?.nativeElement;
      if (bar) {
        onCleanup(this.keepRoomFor(bar));
      }
    });
  }

  private keepRoomFor(bar: HTMLElement): () => void {
    const root = this.document.documentElement;
    const measure = () => root.style.setProperty(ROOM_HEIGHT, `${bar.offsetHeight}px`);
    const view = this.document.defaultView;
    const observer = view?.ResizeObserver ? new view.ResizeObserver(measure) : null;
    const scrollAboveBar = (focused: Element) => {
      const hidden = focused.getBoundingClientRect().bottom - bar.getBoundingClientRect().top;
      if (hidden > 0) {
        const gap = parseFloat(view?.getComputedStyle(bar).bottom ?? '0') || 0;
        view?.scrollBy({ top: hidden + gap, behavior: 'instant' });
      }
    };
    const uncover = (event: FocusEvent) => {
      const focused = event.target;
      if (
        !(focused instanceof Element) ||
        bar.contains(focused) ||
        focused.closest('dialog[open]')
      ) {
        return;
      }
      view?.requestAnimationFrame(() => scrollAboveBar(focused));
    };
    measure();
    observer?.observe(bar);
    root.classList.add(ROOM_CLASS);
    this.document.addEventListener('focusin', uncover);
    return () => {
      observer?.disconnect();
      this.document.removeEventListener('focusin', uncover);
      root.classList.remove(ROOM_CLASS);
      root.style.removeProperty(ROOM_HEIGHT);
    };
  }
}
