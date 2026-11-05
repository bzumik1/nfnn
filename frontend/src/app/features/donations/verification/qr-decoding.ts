import jsQR from 'jsqr';

import type { QrImage } from './qr-image';
import type { QrWorkerAnswer, QrWorkerQuestion } from './qr-reader';

export function decodedQrText(image: QrImage): string | null {
  return (
    jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' })?.data ?? null
  );
}

export function workerAnswerTo(
  question: QrWorkerQuestion,
  decode: (image: QrImage) => string | null = decodedQrText,
): QrWorkerAnswer {
  try {
    return { id: question.id, text: decode(question.image) };
  } catch {
    return { id: question.id, text: null };
  }
}
