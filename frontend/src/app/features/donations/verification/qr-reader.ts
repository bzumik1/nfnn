import { inject, Injectable, InjectionToken } from '@angular/core';
import type { QrImage } from './qr-image';

export interface QrWorkerQuestion {
  readonly id: number;
  readonly image: QrImage;
}

export interface QrWorkerAnswer {
  readonly id: number;
  readonly text: string | null;
}

export interface QrWorker {
  onmessage: ((event: MessageEvent<QrWorkerAnswer>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(question: QrWorkerQuestion, transfer?: Transferable[]): void;
  terminate(): void;
}

export interface QrDetector {
  detect(image: QrImage): Promise<readonly { readonly rawValue: string }[]>;
}

export interface QrReaderEnvironment {
  detector(): Promise<QrDetector | null>;
  worker(): QrWorker;
}

interface BarcodeDetectorClass {
  new (options: { formats: string[] }): QrDetector;
  getSupportedFormats(): Promise<string[]>;
}

const QR_FORMAT = 'qr_code';
export const QR_WORKER_TIMEOUT_MS = 10_000;

async function browserDetector(): Promise<QrDetector | null> {
  const detectorClass = (globalThis as { BarcodeDetector?: BarcodeDetectorClass }).BarcodeDetector;
  if (detectorClass === undefined) {
    return null;
  }
  try {
    const formats = await detectorClass.getSupportedFormats();
    return formats.includes(QR_FORMAT) ? new detectorClass({ formats: [QR_FORMAT] }) : null;
  } catch {
    return null;
  }
}

export const QR_READER_ENVIRONMENT = new InjectionToken<QrReaderEnvironment>('QR reader', {
  providedIn: 'root',
  factory: () => ({
    detector: browserDetector,
    worker: () =>
      new Worker(new URL('./qr-decoder.worker', import.meta.url), { type: 'module' }) as QrWorker,
  }),
});

@Injectable({ providedIn: 'root' })
export class QrReader {
  private readonly environment = inject(QR_READER_ENVIRONMENT);
  private detector: Promise<QrDetector | null> | null = null;
  private worker: QrWorker | null = null;
  private asked = 0;

  async read(image: QrImage): Promise<readonly string[]> {
    const detector = await (this.detector ??= this.environment.detector());
    if (detector !== null) {
      try {
        const found = await detector.detect(image);
        if (found.length > 0) {
          return found.map((code) => code.rawValue);
        }
      } catch {
        this.detector = Promise.resolve(null);
      }
    }
    const text = await this.askWorker(image);
    return text === null ? [] : [text];
  }

  release(): void {
    this.worker?.terminate();
    this.worker = null;
  }

  private askWorker(image: QrImage): Promise<string | null> {
    let worker: QrWorker;
    try {
      worker = this.worker ??= this.environment.worker();
    } catch {
      return Promise.resolve(null);
    }
    const id = ++this.asked;
    return new Promise<string | null>((resolve) => {
      const failed = (): void => {
        clearTimeout(timer);
        if (this.worker === worker) {
          this.release();
        }
        resolve(null);
      };
      const timer = setTimeout(failed, QR_WORKER_TIMEOUT_MS);
      worker.onerror = failed;
      worker.onmessage = ({ data }) => {
        if (data.id === id) {
          clearTimeout(timer);
          resolve(data.text);
        }
      };
      const data = new Uint8ClampedArray(image.data);
      worker.postMessage({ id, image: { data, width: image.width, height: image.height } }, [
        data.buffer,
      ]);
    });
  }
}
