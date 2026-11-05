import { ErrorName } from '../../../core/errors/error-vocabulary';
import { ReceiptArt } from './receipt-art';
import { ReceiptDocument } from './receipt-document';
import { ReceiptStyle } from './receipt-style';

export interface ReceiptDrawingRequest {
  readonly document: ReceiptDocument;
  readonly style: ReceiptStyle;
  readonly signature: ReceiptArt | null;
  readonly portrait: ReceiptArt | null;
}

export type ReceiptWorkerMessage =
  | { readonly kind: 'ready' }
  | { readonly kind: 'page'; readonly page: number }
  | { readonly kind: 'done'; readonly bytes: Uint8Array }
  | {
      readonly kind: 'failed';
      readonly reason: 'tools-missing' | 'fonts' | 'drawing';
      readonly name: ErrorName;
    };

export interface ReceiptWorker {
  onmessage: ((event: MessageEvent<ReceiptWorkerMessage>) => void) | null;
  onerror: ((event: Event) => void) | null;
  postMessage(request: ReceiptDrawingRequest): void;
  terminate(): void;
}
