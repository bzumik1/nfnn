/// <reference types="@angular/localize" />

import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { CopyButton } from '../copy-button/copy-button';

@Component({
  selector: 'app-share-button',
  imports: [CopyButton],
  templateUrl: './share-button.html',
  styleUrl: './share-button.scss',
  host: { '[class.is-on-dark]': "tone() === 'dark'" },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShareButton {
  readonly pageTitle = input.required<string>();
  readonly url = input.required<string>();
  readonly subject = input<string | null>(null);
  readonly tone = input<'light' | 'dark'>('light');

  protected readonly copyWhat = $localize`:@@ui.share.copyWhat:odkaz na stránku`;
  protected readonly copyLabel = $localize`:@@ui.share.copyLink:Kopírovat odkaz`;
  protected readonly copiedStatus = $localize`:@@ui.share.copied:Odkaz je zkopírovaný, můžete ho vložit do zprávy.`;
  protected readonly copyFailedStatus = $localize`:@@ui.share.copyFailed:Zkopírovat se nepodařilo. Odkaz najdete v adresním řádku prohlížeče.`;

  protected readonly sharing = signal(false);
  protected readonly refused = signal(false);
  protected readonly refusals = signal(0);
  private readonly shareData = computed<ShareData>(() => ({
    title: this.pageTitle(),
    url: this.url(),
  }));
  protected readonly canShare = computed(() => deviceCanShare(this.shareData()));

  protected async share(): Promise<void> {
    if (this.sharing()) {
      return;
    }
    this.sharing.set(true);
    try {
      await navigator.share(this.shareData());
      this.refused.set(false);
    } catch (failure) {
      if (!isAbort(failure)) {
        this.refused.set(true);
        this.refusals.update((count) => count + 1);
      }
    } finally {
      this.sharing.set(false);
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
