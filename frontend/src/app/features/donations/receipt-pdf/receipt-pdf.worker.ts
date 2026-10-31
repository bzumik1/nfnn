/// <reference lib="webworker" />

import { drawReceipt, ReceiptFonts } from './receipt-layout';
import { ReceiptDrawingRequest, ReceiptWorkerMessage } from './receipt-worker-messages';

const FONT_FILES: Readonly<Record<keyof ReceiptFonts, string>> = {
  body: 'body.ttf',
  bold: 'body-bold.ttf',
  heading: 'heading.ttf',
};

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

async function fonts(): Promise<ReceiptFonts> {
  const [body, bold, heading] = await Promise.all([
    font(FONT_FILES.body),
    font(FONT_FILES.bold),
    font(FONT_FILES.heading),
  ]);
  return { body, bold, heading };
}

async function draw(request: ReceiptDrawingRequest): Promise<void> {
  let loaded: ReceiptFonts;
  try {
    loaded = await fonts();
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
