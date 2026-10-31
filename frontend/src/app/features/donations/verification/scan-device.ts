import { DOCUMENT } from '@angular/common';
import { inject, InjectionToken } from '@angular/core';
import { pictureSize } from './picture-size';
import type { QrImage } from './qr-image';

export interface ScanDevice {
  hasCamera(): boolean;
  openCamera(): Promise<MediaStream>;
  attach(video: HTMLVideoElement, stream: MediaStream): Promise<void>;
  frame(video: HTMLVideoElement): QrImage | null;
  picture(file: Blob): Promise<QrImage>;
}

const LARGEST_FRAME_SIDE = 1_280;
const LARGEST_PICTURE_SIDE = 2_400;
const HAVE_CURRENT_DATA = 2;
export const LARGEST_PICTURE_PIXELS = 50_000_000;

export class PictureTooLarge extends Error {}

function scaled(width: number, height: number, largest: number): { width: number; height: number } {
  const factor = Math.min(1, largest / Math.max(width, height));
  return { width: Math.round(width * factor), height: Math.round(height * factor) };
}

function pixels(
  document: Document,
  source: CanvasImageSource,
  width: number,
  height: number,
  largest: number,
): QrImage | null {
  const size = scaled(width, height, largest);
  if (size.width === 0 || size.height === 0) {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (context === null) {
    return null;
  }
  context.drawImage(source, 0, 0, size.width, size.height);
  return context.getImageData(0, 0, size.width, size.height);
}

export const SCAN_DEVICE = new InjectionToken<ScanDevice>('scan device', {
  providedIn: 'root',
  factory: () => {
    const document = inject(DOCUMENT);
    const media = document.defaultView?.navigator.mediaDevices;
    return {
      hasCamera: () => typeof media?.getUserMedia === 'function',
      openCamera: () => {
        if (media === undefined) {
          return Promise.reject(new DOMException('', 'NotFoundError'));
        }
        return media.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
        });
      },
      attach: async (video, stream) => {
        video.srcObject = stream;
        await video.play();
      },
      frame: (video) =>
        video.readyState < HAVE_CURRENT_DATA
          ? null
          : pixels(document, video, video.videoWidth, video.videoHeight, LARGEST_FRAME_SIDE),
      picture: async (file) => {
        const size = pictureSize(new Uint8Array(await file.arrayBuffer()));
        if (size === null) {
          throw new Error('The picture is no PNG, JPEG or WebP.');
        }
        if (size.width * size.height > LARGEST_PICTURE_PIXELS) {
          throw new PictureTooLarge();
        }
        const bitmap = await createImageBitmap(file);
        try {
          const image = pixels(document, bitmap, bitmap.width, bitmap.height, LARGEST_PICTURE_SIDE);
          if (image === null) {
            throw new Error('The picture has no pixels.');
          }
          return image;
        } finally {
          bitmap.close();
        }
      },
    };
  },
});
