/// <reference types="@angular/localize" />

import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { CopyButton } from '../copy-button/copy-button';

type ShareState = 'idle' | 'sharing' | 'failed';

@Component({
  selector: 'app-share-button',
  imports: [CopyButton],
  templateUrl: './share-button.html',
  styleUrl: './share-button.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShareButton {
  readonly pageTitle = input.required<string>();
  readonly url = input.required<string>();

  protected readonly copyWhat = $localize`:@@ui.share.copyWhat:odkaz na stránku`;
  protected readonly copyLabel = $localize`:@@ui.share.copyLink:Kopírovat odkaz`;
  protected readonly copiedStatus = $localize`:@@ui.share.copied:Odkaz je zkopírovaný, můžete ho vložit do zprávy.`;

  protected readonly state = signal<ShareState>('idle');
  private readonly shareData = computed<ShareData>(() => ({
    title: this.pageTitle(),
    url: this.url(),
  }));
  protected readonly canShare = computed(() => deviceCanShare(this.shareData()));

  protected async share(): Promise<void> {
    if (this.state() === 'sharing') {
      return;
    }
    this.state.set('sharing');
    try {
      await navigator.share(this.shareData());
      this.state.set('idle');
    } catch (failure) {
      this.state.set(isAbort(failure) ? 'idle' : 'failed');
    }
  }
}

function deviceCanShare(data: ShareData): boolean {
  if (typeof navigator.share !== 'function') {
    return false;
  }
  return typeof navigator.canShare !== 'function' || navigator.canShare(data);
}

function isAbort(failure: unknown): boolean {
  return failure instanceof DOMException && failure.name === 'AbortError';
}
