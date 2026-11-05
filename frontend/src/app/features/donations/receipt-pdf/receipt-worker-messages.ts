import { ErrorName } from '../../../core/errors/error-vocabulary';
import { ReceiptArt } from './receipt-art';
import { ReceiptDocument } from './receipt-document';
import { ReceiptBundleOptions } from './receipt-bundle-options';
import { ReceiptStyle } from './receipt-style';

export interface ReceiptDrawingRequest {
  readonly document: ReceiptDocument;
  readonly style: ReceiptStyle;
  readonly signature: ReceiptArt | null;
  readonly portrait: ReceiptArt | null;
}

export interface ReceiptBundleRequest {
  readonly kind: 'bundle';
  readonly documents: readonly ReceiptDocument[];
  readonly art: Readonly<Record<string, ReceiptArt>>;
  readonly options: ReceiptBundleOptions;
  readonly style: ReceiptStyle;
}

export type ReceiptWorkerRequest = ReceiptDrawingRequest | ReceiptBundleRequest;

export type ReceiptWorkerMessage =
  | { readonly kind: 'ready' }
  | { readonly kind: 'page'; readonly page: number }
  | { readonly kind: 'receipt'; readonly index: number }
  | { readonly kind: 'done'; readonly bytes: Uint8Array }
  | {
      readonly kind: 'failed';
      readonly reason: 'tools-missing' | 'fonts' | 'drawing';
      readonly name: ErrorName;
    };

export interface ReceiptWorker {
  onmessage: ((event: MessageEvent<ReceiptWorkerMessage>) => void) | null;
  onerror: ((event: Event) => void) | null;
  postMessage(request: ReceiptWorkerRequest): void;
  terminate(): void;
}
