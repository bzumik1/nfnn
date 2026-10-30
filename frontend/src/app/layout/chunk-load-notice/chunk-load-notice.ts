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
import { keepRoomForFloatingNotice } from '../../shared/ui/floating-notice/floating-notice-room';

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
        onCleanup(keepRoomForFloatingNotice(this.document, bar));
      }
    });
  }
}
