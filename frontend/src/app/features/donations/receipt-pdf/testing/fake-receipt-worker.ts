import { ReceiptStyle } from '../receipt-style';
import {
  ReceiptDrawingRequest,
  ReceiptWorker,
  ReceiptWorkerMessage,
} from '../receipt-worker-messages';
import { ReceiptPdfEnvironment } from '../receipt-pdf';
import { TEST_STYLE } from './receipt-style-fixture';

export class FakeReceiptWorker implements ReceiptWorker {
  onmessage: ((event: MessageEvent<ReceiptWorkerMessage>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readonly requests: ReceiptDrawingRequest[] = [];
  terminated = false;

  postMessage(request: ReceiptDrawingRequest): void {
    this.requests.push(request);
  }

  terminate(): void {
    this.terminated = true;
  }

  say(message: ReceiptWorkerMessage): void {
    this.onmessage?.(new MessageEvent('message', { data: message }));
  }

  fail(): void {
    this.onerror?.(new Event('error'));
  }

  drawAll(pages = 1): void {
    this.say({ kind: 'ready' });
    for (let page = 1; page <= pages; page++) {
      this.say({ kind: 'page', page });
    }
    this.say({ kind: 'done', bytes: new TextEncoder().encode('%PDF-1.7\n%%EOF') });
  }
}

export class FakeReceiptPdfEnvironment implements ReceiptPdfEnvironment {
  readonly workers: FakeReceiptWorker[] = [];
  autoDraw = false;

  worker(): ReceiptWorker {
    const worker = new FakeReceiptWorker();
    this.workers.push(worker);
    if (this.autoDraw) {
      queueMicrotask(() => worker.drawAll());
    }
    return worker;
  }

  style(): ReceiptStyle {
    return TEST_STYLE;
  }

  last(): FakeReceiptWorker {
    const worker = this.workers.at(-1);
    if (worker === undefined) {
      throw new Error('no receipt worker was started');
    }
    return worker;
  }
}
