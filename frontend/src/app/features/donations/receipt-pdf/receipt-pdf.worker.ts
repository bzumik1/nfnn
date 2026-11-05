/// <reference lib="webworker" />

import { errorNameOf } from '../../../core/errors/error-vocabulary';
import { ReceiptArt } from './receipt-art';
import { loadReceiptFonts } from './receipt-fonts';
import { drawReceipt, drawReceiptBundle, ReceiptFonts } from './receipt-layout';
import {
  ReceiptBundleRequest,
  ReceiptDrawingRequest,
  ReceiptWorkerMessage,
  ReceiptWorkerRequest,
} from './receipt-worker-messages';

function post(message: ReceiptWorkerMessage, transfer: Transferable[] = []): void {
  postMessage(message, transfer);
}

function single(request: ReceiptDrawingRequest, fonts: ReceiptFonts): Promise<Uint8Array> {
  return drawReceipt(
    request.document,
    request.style,
    { fonts, signature: request.signature, portrait: request.portrait },
    (page) => post({ kind: 'page', page }),
  );
}

function bundle(request: ReceiptBundleRequest, fonts: ReceiptFonts): Promise<Uint8Array> {
  const art = (sha256: string | null): ReceiptArt | null =>
    sha256 === null ? null : (request.art[sha256] ?? null);
  return drawReceiptBundle(
    request.documents.map((document) => ({
      document,
      artwork: {
        signature: art(document.signature.signatureImage),
        portrait: art(document.signature.portraitImage),
      },
    })),
    request.options,
    request.style,
    fonts,
    (index) => post({ kind: 'receipt', index }),
  );
}

async function draw(request: ReceiptWorkerRequest): Promise<void> {
  const load = await loadReceiptFonts(request.style.fonts);
  if (!load.loaded) {
    post({ kind: 'failed', reason: load.reason, name: load.name });
    return;
  }
  try {
    const bytes =
      'kind' in request ? await bundle(request, load.fonts) : await single(request, load.fonts);
    post({ kind: 'done', bytes }, [bytes.buffer]);
  } catch (failure: unknown) {
    post({ kind: 'failed', reason: 'drawing', name: errorNameOf(failure) });
  }
}

addEventListener('message', (event: MessageEvent<ReceiptWorkerRequest>) => {
  void draw(event.data);
});

post({ kind: 'ready' });
