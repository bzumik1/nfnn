/// <reference lib="webworker" />

import { workerAnswerTo } from './qr-decoding';
import type { QrWorkerAnswer, QrWorkerQuestion } from './qr-reader';

addEventListener('message', ({ data }: MessageEvent<QrWorkerQuestion>) => {
  const answer: QrWorkerAnswer = workerAnswerTo(data);
  postMessage(answer);
});
