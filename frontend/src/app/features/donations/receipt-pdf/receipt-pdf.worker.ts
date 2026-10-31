/// <reference lib="webworker" />

import { drawReceipt, ReceiptFonts } from './receipt-layout';
import { ReceiptStyle } from './receipt-style';
import { ReceiptDrawingRequest, ReceiptWorkerMessage } from './receipt-worker-messages';

function post(message: ReceiptWorkerMessage, transfer: Transferable[] = []): void {
  postMessage(message, transfer);
}

async function font(file: string): Promise<Uint8Array> {
  const response = await fetch(`/receipt-fonts/${file}`);
  if (!response.ok) {
    throw new Error(`The receipt font ${file} answered ${response.status}.`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function fonts(files: ReceiptStyle['fonts']): Promise<ReceiptFonts> {
  const [body, bold, heading] = await Promise.all([
    font(files.body),
    font(files.bold),
    font(files.heading),
  ]);
  return { body, bold, heading };
}

async function draw(request: ReceiptDrawingRequest): Promise<void> {
  let loaded: ReceiptFonts;
  try {
    loaded = await fonts(request.style.fonts);
  } catch {
    post({ kind: 'failed', reason: 'fonts' });
    return;
  }
  try {
    const bytes = await drawReceipt(
      request.document,
      request.style,
      { fonts: loaded, signature: request.signature, portrait: request.portrait },
      (page) => post({ kind: 'page', page }),
    );
    post({ kind: 'done', bytes }, [bytes.buffer]);
  } catch {
    post({ kind: 'failed', reason: 'drawing' });
  }
}

addEventListener('message', (event: MessageEvent<ReceiptDrawingRequest>) => {
  void draw(event.data);
});

post({ kind: 'ready' });
