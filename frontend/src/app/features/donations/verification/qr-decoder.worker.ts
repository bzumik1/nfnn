/// <reference lib="webworker" />

import { decodedQrText } from './qr-decoding';
import type { QrWorkerAnswer, QrWorkerQuestion } from './qr-reader';

addEventListener('message', ({ data }: MessageEvent<QrWorkerQuestion>) => {
  const answer: QrWorkerAnswer = { id: data.id, text: decodedQrText(data.image) };
  postMessage(answer);
});
