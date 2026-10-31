import { inject, Injectable, InjectionToken } from '@angular/core';
import { DownloadedFile } from '../donations-api';
import { saveBlob } from '../file-download';

export interface ShareableNavigator {
  readonly userAgent: string;
  readonly maxTouchPoints: number;
  canShare?(data: ShareData): boolean;
  share?(data: ShareData): Promise<void>;
}

export const PDF_DELIVERY_NAVIGATOR = new InjectionToken<ShareableNavigator>(
  'navigator for delivering a PDF',
  { providedIn: 'root', factory: () => navigator },
);

export type PdfShareOutcome = 'shared' | 'saved' | 'dismissed' | 'failed';

const APPLE_TOUCH_DEVICE = /iPad|iPhone|iPod/;
const DESKTOP_SAFARI_ON_IPAD = /Macintosh/;

@Injectable({ providedIn: 'root' })
export class PdfDelivery {
  private readonly navigator = inject(PDF_DELIVERY_NAVIGATOR);

  needsSecondTap(file: DownloadedFile): boolean {
    const agent = this.navigator.userAgent;
    const appleTouch =
      APPLE_TOUCH_DEVICE.test(agent) ||
      (DESKTOP_SAFARI_ON_IPAD.test(agent) && this.navigator.maxTouchPoints > 1);
    return appleTouch && this.canShare(file);
  }

  save(file: DownloadedFile): void {
    saveBlob(file);
  }

  async share(file: DownloadedFile): Promise<PdfShareOutcome> {
    if (!this.canShare(file) || this.navigator.share === undefined) {
      this.save(file);
      return 'shared';
    }
    try {
      await this.navigator.share({ files: [this.asFile(file)], title: file.fileName });
      return 'shared';
    } catch (failure: unknown) {
      return failure instanceof DOMException && failure.name === 'AbortError'
        ? 'dismissed'
        : 'failed';
    }
  }

  private canShare(file: DownloadedFile): boolean {
    try {
      return this.navigator.canShare?.({ files: [this.asFile(file)] }) ?? false;
    } catch {
      return false;
    }
  }

  private asFile(file: DownloadedFile): File {
    return new File([file.blob], file.fileName, { type: 'application/pdf' });
  }
}
