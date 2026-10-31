import { inject, Injectable, InjectionToken } from '@angular/core';
import { ErrorReporter } from '../../../core/errors/error-reporter';
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

export class QrReaderOutdated extends Error {}

const QR_FORMAT = 'qr_code';
export const QR_WORKER_TIMEOUT_MS = 10_000;
export const QR_WORKER_STARTS_BEFORE_GIVING_UP = 3;

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
  private readonly reporter = inject(ErrorReporter);
  private readonly waiting = new Map<number, (text: string | null) => void>();
  private detector: Promise<QrDetector | null> | null = null;
  private worker: QrWorker | null = null;
  private asked = 0;
  private failedStarts = 0;

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
    const waiting = [...this.waiting.values()];
    this.waiting.clear();
    waiting.forEach((answer) => answer(null));
  }

  private askWorker(image: QrImage): Promise<string | null> {
    if (this.failedStarts >= QR_WORKER_STARTS_BEFORE_GIVING_UP) {
      return Promise.reject(new QrReaderOutdated('The QR worker of this page does not start.'));
    }
    const worker = this.startedWorker();
    if (worker === null) {
      return Promise.resolve(null);
    }
    const id = ++this.asked;
    return new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => {
        if (this.worker === worker) {
          this.release();
        }
      }, QR_WORKER_TIMEOUT_MS);
      this.waiting.set(id, (text) => {
        clearTimeout(timer);
        resolve(text);
      });
      const data = new Uint8ClampedArray(image.data);
      worker.postMessage({ id, image: { data, width: image.width, height: image.height } }, [
        data.buffer,
      ]);
    });
  }

  private startedWorker(): QrWorker | null {
    if (this.worker !== null) {
      return this.worker;
    }
    let worker: QrWorker;
    try {
      worker = this.environment.worker();
    } catch (failure: unknown) {
      this.startFailed(failure);
      return null;
    }
    let answered = false;
    worker.onmessage = ({ data }) => {
      answered = true;
      this.failedStarts = 0;
      const answer = this.waiting.get(data.id);
      this.waiting.delete(data.id);
      answer?.(data.text);
    };
    worker.onerror = (event) => {
      if (!answered) {
        this.startFailed(event.error);
      }
      if (this.worker === worker) {
        this.release();
      }
    };
    this.worker = worker;
    return worker;
  }

  private startFailed(failure: unknown): void {
    this.failedStarts++;
    this.reporter.report('qr-encode', 'global', failure);
  }
}
