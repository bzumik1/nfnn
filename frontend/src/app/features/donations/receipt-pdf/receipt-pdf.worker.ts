/// <reference lib="webworker" />

import { errorNameOf } from '../../../core/errors/error-vocabulary';
import { loadReceiptFonts } from './receipt-fonts';
import { drawReceipt } from './receipt-layout';
import { ReceiptDrawingRequest, ReceiptWorkerMessage } from './receipt-worker-messages';

function post(message: ReceiptWorkerMessage, transfer: Transferable[] = []): void {
  postMessage(message, transfer);
}

async function draw(request: ReceiptDrawingRequest): Promise<void> {
  const load = await loadReceiptFonts(request.style.fonts);
  if (!load.loaded) {
    post({ kind: 'failed', reason: load.reason, name: load.name });
    return;
  }
  try {
    const bytes = await drawReceipt(
      request.document,
      request.style,
      { fonts: load.fonts, signature: request.signature, portrait: request.portrait },
      (page) => post({ kind: 'page', page }),
    );
    post({ kind: 'done', bytes }, [bytes.buffer]);
  } catch (failure: unknown) {
    post({ kind: 'failed', reason: 'drawing', name: errorNameOf(failure) });
  }
}

addEventListener('message', (event: MessageEvent<ReceiptDrawingRequest>) => {
  void draw(event.data);
});

post({ kind: 'ready' });
