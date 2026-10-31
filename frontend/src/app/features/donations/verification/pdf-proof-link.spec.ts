// @vitest-environment node

import { receiptCaptions } from '../receipt-pdf/receipt-captions';
import { receiptDocument } from '../receipt-pdf/receipt-document';
import { drawReceipt } from '../receipt-pdf/receipt-layout';
import {
  frozenCase,
  SINGLE_PERSON_CS,
  YEARLY_366,
  YEARLY_BILINGUAL,
} from '../receipt-pdf/testing/receipt-fixtures';
import { themeFonts, themeStyle } from '../receipt-pdf/testing/receipt-style-fixture';
import { PROOF_ADDRESS } from './receipt-proof';
import { proofFragmentInPdf } from './pdf-proof-link';

const DIGITS = '10031885061882060800046343990168929322040303989858395561963591784434255';

function pdfWith(...objects: string[]): Uint8Array {
  const body = objects.map((object, index) => `${index + 1} 0 obj\n${object}\nendobj\n`).join('');
  return new TextEncoder().encode(`%PDF-1.7\n${body}trailer\n<< /Root 1 0 R >>\n%%EOF\n`);
}

function hexOf(text: string): string {
  return Array.from(new TextEncoder().encode(text), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

function utf16HexOf(text: string): string {
  return (
    'FEFF' +
    Array.from(text, (character) => character.charCodeAt(0).toString(16).padStart(4, '0')).join('')
  );
}

describe('Given a receipt PDF drawn by the browser', () => {
  for (const name of [SINGLE_PERSON_CS, YEARLY_BILINGUAL, YEARLY_366]) {
    it(`when the PDF of "${name}" is read, then it gives the digits of its verification link`, async () => {
      const frozen = frozenCase(name);
      const bytes = await drawReceipt(
        receiptDocument(frozen, '2027-01-15T09:30:00Z', receiptCaptions()),
        themeStyle('nova-nadeje'),
        { fonts: themeFonts('nova-nadeje'), signature: null, portrait: null },
      );

      expect(proofFragmentInPdf(bytes)).toBe(
        frozen.verification.qrText.slice(PROOF_ADDRESS.length),
      );
    });
  }
});

describe('Given a PDF written elsewhere', () => {
  it('when its link is a literal string, then it gives the digits', () => {
    const bytes = pdfWith(
      `<< /Type /Annot /Subtype /Link /A << /S /URI /URI (${PROOF_ADDRESS}${DIGITS}) >> >>`,
    );

    expect(proofFragmentInPdf(bytes)).toBe(DIGITS);
  });

  it('when its link is a hex string, then it gives the digits', () => {
    const bytes = pdfWith(`<< /A << /S /URI /URI <${hexOf(PROOF_ADDRESS + DIGITS)}> >> >>`);

    expect(proofFragmentInPdf(bytes)).toBe(DIGITS);
  });

  it('when its link is a UTF-16 hex string, then it gives the digits', () => {
    const bytes = pdfWith(`<< /A << /S /URI /URI <${utf16HexOf(PROOF_ADDRESS + DIGITS)}> >> >>`);

    expect(proofFragmentInPdf(bytes)).toBe(DIGITS);
  });

  it('when its literal link escapes characters and breaks a line, then it reads them as PDF does', () => {
    const escaped = `https:\\/\\/nfnn.cz\\/overit\\043${DIGITS.slice(0, 20)}\\\n${DIGITS.slice(20)}`;
    const bytes = pdfWith(`<< /A << /S /URI /URI (${escaped}) >> >>`);

    expect(proofFragmentInPdf(bytes)).toBe(DIGITS);
  });

  it('when another link comes first, then it skips it and gives the verification link', () => {
    const bytes = pdfWith(
      '<< /A << /S /URI /URI (https://example.org/overit#123) >> >>',
      `<< /A << /S /URI /URI (${PROOF_ADDRESS}${DIGITS}) >> >>`,
    );

    expect(proofFragmentInPdf(bytes)).toBe(DIGITS);
  });

  it('when it links only elsewhere, then it gives nothing', () => {
    const bytes = pdfWith(`<< /A << /S /URI /URI (https://nfnn.cz.example/overit#${DIGITS}) >> >>`);

    expect(proofFragmentInPdf(bytes)).toBeNull();
  });

  it('when it has no link at all, then it gives nothing', () => {
    expect(proofFragmentInPdf(pdfWith('<< /Type /Catalog >>'))).toBeNull();
  });

  it('when the file is no PDF, then it gives nothing', () => {
    expect(proofFragmentInPdf(new TextEncoder().encode(`${PROOF_ADDRESS}${DIGITS}`))).toBeNull();
  });

  for (const [name, opening] of [
    ['literal', '('],
    ['hex', '<'],
  ]) {
    it(`when a 20 MB file repeats ${name} link strings that never close, then it gives nothing at once`, () => {
      const head = new TextEncoder().encode('%PDF-1.7\n');
      const run = new TextEncoder().encode(`/URI${opening}`);
      const bytes = new Uint8Array(20 * 1024 * 1024);
      bytes.set(head);
      for (let at = head.length; at + run.length <= bytes.length; at += run.length) {
        bytes.set(run, at);
      }
      const started = performance.now();

      expect(proofFragmentInPdf(bytes)).toBeNull();
      expect(performance.now() - started).toBeLessThan(2_000);
    });
  }

  it('when a hex string far longer than any link comes first, then it skips it and gives the verification link', () => {
    const bytes = pdfWith(
      `<< /A << /S /URI /URI <${'41'.repeat(300_000)}> >> >>`,
      `<< /A << /S /URI /URI (${PROOF_ADDRESS}${DIGITS}) >> >>`,
    );

    expect(proofFragmentInPdf(bytes)).toBe(DIGITS);
  });

  it('when the longest possible link is written as UTF-16 hex with line breaks, then it still gives the digits', () => {
    const longest = '1' + '0'.repeat(7_088);
    const hex = utf16HexOf(PROOF_ADDRESS + longest).replace(/(.{64})/g, '$1\n');
    const bytes = pdfWith(`<< /A << /S /URI /URI <${hex}> >> >>`);

    expect(proofFragmentInPdf(bytes)).toBe(longest);
  });

  it('when the longest possible link escapes every character, then it still gives the digits', () => {
    const longest = '1' + '0'.repeat(7_088);
    const escaped = Array.from(
      PROOF_ADDRESS + longest,
      (character) => `\\${character.charCodeAt(0).toString(8).padStart(3, '0')}`,
    ).join('');
    const bytes = pdfWith(`<< /A << /S /URI /URI (${escaped}) >> >>`);

    expect(proofFragmentInPdf(bytes)).toBe(longest);
  });

  it('when a literal string is never closed, then it gives nothing', () => {
    const bytes = pdfWith(`<< /A << /S /URI /URI (${PROOF_ADDRESS}${DIGITS}`);

    expect(proofFragmentInPdf(bytes)).toBeNull();
  });
});
