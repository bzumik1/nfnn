// @vitest-environment node

import { isDark } from '../../../shared/ui/qr-code/qr-matrix';
import { frozenCase, SINGLE_PERSON_CS, YEARLY_366 } from '../receipt-pdf/testing/receipt-fixtures';
import { verificationSymbol } from '../receipt-pdf/verification-qr';
import { decodedQrText, workerAnswerTo } from './qr-decoding';
import type { QrImage } from './qr-image';

const QUIET_ZONE = 4;

function photographed(
  qrText: string,
  pixelsPerModule: number,
  { inverted = false, margin = 0 } = {},
): QrImage {
  const symbol = verificationSymbol(qrText);
  const side = Math.ceil((symbol.size + 2 * QUIET_ZONE) * pixelsPerModule) + 2 * margin;
  const data = new Uint8ClampedArray(side * side * 4);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const column = Math.floor((x - margin) / pixelsPerModule) - QUIET_ZONE;
      const row = Math.floor((y - margin) / pixelsPerModule) - QUIET_ZONE;
      const inside = column >= 0 && row >= 0 && column < symbol.size && row < symbol.size;
      const dark = inside && isDark(symbol, column, row);
      const value = dark !== inverted ? 20 : 235;
      data.set([value, value, value, 255], (y * side + x) * 4);
    }
  }
  return { data, width: side, height: side };
}

describe('Given an image of a verification QR code', () => {
  for (const name of [SINGLE_PERSON_CS, YEARLY_366]) {
    it(`when the code of "${name}" is read, then it gives the link it carries`, () => {
      const qrText = frozenCase(name).verification.qrText;

      expect(decodedQrText(photographed(qrText, 4, { margin: 40 }))).toBe(qrText);
    });
  }

  it('when the code is light on dark, as a dark-mode screenshot shows it, then it still gives the link', () => {
    const qrText = frozenCase(SINGLE_PERSON_CS).verification.qrText;

    expect(decodedQrText(photographed(qrText, 4, { inverted: true }))).toBe(qrText);
  });

  it('when the image holds no code, then it gives nothing', () => {
    const blank: QrImage = {
      data: new Uint8ClampedArray(200 * 200 * 4).fill(255),
      width: 200,
      height: 200,
    };

    expect(decodedQrText(blank)).toBeNull();
  });
});

describe('Given a question to the QR worker', () => {
  const image: QrImage = { data: new Uint8ClampedArray(4), width: 1, height: 1 };

  it('when reading the image throws, then the worker answers that it found no code, so the page never takes the crash for a worker that does not start', () => {
    const answer = workerAnswerTo({ id: 7, image }, () => {
      throw new RangeError('out of memory');
    });

    expect(answer).toEqual({ id: 7, text: null });
  });

  it('when the image holds a code, then the worker answers its text', () => {
    expect(workerAnswerTo({ id: 8, image }, () => 'https://nfnn.cz/overit#1')).toEqual({
      id: 8,
      text: 'https://nfnn.cz/overit#1',
    });
  });
});
