import { sharedCases } from '../../../../testing/shared-cases';
import { FrozenReceipt } from './frozen-receipt';
import { ReceiptArt } from './receipt-art';
import { receiptDocument, ReceiptDocument } from './receipt-document';
import { drawReceipt, ReceiptAssets } from './receipt-layout';
import { RECEIPT_PRINTABLE_RANGES } from './receipt-characters';
import { parseVectorArt } from './vector-art';
import { verificationSymbol, qrPlacement } from './verification-qr';
import {
  blurred,
  cropped,
  decodedQr,
  noisy,
  normalised,
  rasterPage,
  readPdf,
  ReadPdf,
} from './testing/pdf-reader';
import {
  frozenCase,
  SINGLE_PERSON_CS,
  SINGLE_SIGNATURE,
  TEST_CAPTIONS,
  YEARLY_120,
  YEARLY_366,
  YEARLY_40,
} from './testing/receipt-fixtures';
import { TEST_STYLE, themeFonts } from './testing/receipt-style-fixture';
import {
  base64Bytes,
  SYNTHETIC_PORTRAIT_PNG_BASE64,
  SYNTHETIC_SIGNATURE_JSON,
} from './testing/synthetic-art';

const ISSUED_AT = '2027-01-15T09:30:00Z';
const RECEIPT_THEMES = ['nova-nadeje', 'control'] as const;
const A4 = { width: 595.28, height: 841.89 };
const CAPTION_PHRASES = [
  TEST_CAPTIONS.verificationHeading.cs,
  TEST_CAPTIONS.verificationText.cs,
  TEST_CAPTIONS.verificationHeading.en ?? '',
  TEST_CAPTIONS.verificationText.en ?? '',
];

const NO_ART: ReceiptAssets = { fonts: themeFonts(), signature: null, portrait: null };
const VECTOR_SIGNATURE: ReceiptArt = {
  kind: 'vector',
  art: parseVectorArt(SYNTHETIC_SIGNATURE_JSON),
};
const PORTRAIT: ReceiptArt = { kind: 'raster', bytes: base64Bytes(SYNTHETIC_PORTRAIT_PNG_BASE64) };

function documentOf(frozen: FrozenReceipt): ReceiptDocument {
  return receiptDocument(frozen, ISSUED_AT, TEST_CAPTIONS);
}

function withoutOnce(text: string, phrase: string): string {
  const at = text.indexOf(phrase);
  return at < 0 ? text : normalised(text.slice(0, at) + ' ' + text.slice(at + phrase.length));
}

function occurrences(text: string, phrase: string): number {
  return phrase === '' ? 0 : text.split(phrase).length - 1;
}

function twelveGiftYear(): FrozenReceipt {
  const frozen = frozenCase(YEARLY_120);
  const gifts = frozen.gifts.slice(0, 12);
  const twelve = sharedCases('verification/payload.json').find(
    (sharedCase) => sharedCase.name === 'a yearly receipt of 12 gifts',
  );
  if (twelve === undefined || !('qrText' in twelve.expected)) {
    throw new Error('verification/payload.json has no yearly receipt of 12 gifts');
  }
  return {
    ...frozen,
    gifts,
    total: { ...frozen.total, amountMinor: gifts.reduce((sum, gift) => sum + gift.amountMinor, 0) },
    verification: { ...frozen.verification, qrText: twelve.expected.qrText },
  };
}

describe('Given every frozen receipt case and the text v2 printed for it', () => {
  const printed = new Map(
    sharedCases('receipts/v1/printed.json').map((sharedCase) => [
      sharedCase.name,
      sharedCase.expected,
    ]),
  );

  for (const sharedCase of sharedCases('receipts/v1/frozen.json')) {
    describe(`Given the shared case ${sharedCase.name}`, () => {
      const expected = printed.get(sharedCase.name);
      const frozen = structuredClone(sharedCase.expected) as FrozenReceipt;
      let bytes: Uint8Array;
      let read: ReadPdf;

      beforeAll(async () => {
        bytes = await drawReceipt(documentOf(frozen), TEST_STYLE, NO_ART);
        read = await readPdf(bytes);
      }, 60_000);

      it('when it is drawn, then its printed text is that case', () => {
        expect(expected).toBeDefined();
      });

      it('when it is drawn, then the text outside the page artifacts is v2 text word for word, with the D11 dates and only the listed additions', () => {
        let body = normalised(read.pages.map((page) => page.text).join(' '));
        if (expected?.tableHeader) {
          expect(occurrences(body, expected.tableHeader)).toBe(1);
          body = withoutOnce(body, expected.tableHeader);
        }
        for (const phrase of CAPTION_PHRASES) {
          body = withoutOnce(body, phrase);
        }

        expect(body).toBe(expected?.body);
      });

      it('when it is drawn, then every page is A4 and carries the footer with its number as a pagination artifact', () => {
        const count = read.pages.length;
        for (const page of read.pages) {
          expect(page.widthPt).toBeCloseTo(A4.width, 1);
          expect(page.heightPt).toBeCloseTo(A4.height, 1);
          expect(page.artifacts).toContain(`${expected?.footer} ${page.number} / ${count}`);
        }
      });

      it('when it is drawn, then it has at most one page more than v2 had', () => {
        expect(read.pages.length).toBeLessThanOrEqual((expected?.v2Pages ?? 0) + 1);
      });

      it('when a yearly receipt runs onto further pages, then each of them repeats the column headers as an artifact', () => {
        if (!expected?.tableHeader) {
          return;
        }
        const tablePages = read.pages.filter((page) =>
          /\d{2}\. \d{2}\. \d{4}( \([^)]*\))? [\d ]+(,\d\d)? Kč/.test(page.text),
        );
        for (const page of tablePages.slice(1)) {
          expect(page.artifacts).toContain(expected.tableHeader);
        }
      });

      it('when it is drawn, then every link on it opens the proof of its QR code', () => {
        const links = read.pages.flatMap((page) => page.links);

        expect(links.length).toBeGreaterThan(0);
        for (const link of links) {
          expect(link.url).toBe(frozen.verification.qrText);
        }
      });

      it('when it is drawn, then it is a tagged PDF in Czech with headings, paragraphs, a described QR figure and its link', () => {
        expect(read.raw).toContain('/StructTreeRoot');
        expect(read.raw).toMatch(/\/MarkInfo \d+ 0 R/);
        expect(read.raw).toMatch(/<<\s*\/Marked true\s*>>/);
        expect(read.raw).toMatch(/\/Lang \(cs\)/);
        expect(read.roles).toEqual(
          expect.arrayContaining(['Document', 'H1', 'H2', 'P', 'Figure', 'Link']),
        );
        expect(read.figureAlts).toContain(TEST_CAPTIONS.verificationAlt);
        if (frozen.kind === 'YEARLY') {
          expect(read.roles).toEqual(expect.arrayContaining(['Table', 'TR', 'TH', 'TD']));
        }
        if (frozen.locale === 'en') {
          expect(read.raw).toMatch(/\/Lang \(en\)/);
        }
      });

      it('when it is drawn, then its fonts are embedded subsets with a ToUnicode map and no character came out unreadable', () => {
        const embedded = read.raw.match(/\/FontFile2/g) ?? [];
        const unicodeMaps = read.raw.match(/\/ToUnicode/g) ?? [];
        const names = read.raw.match(/\/BaseFont \/[A-Z]{6}\+[A-Za-z-]+/g) ?? [];

        expect(embedded.length).toBeGreaterThanOrEqual(2);
        expect(unicodeMaps.length).toBe(embedded.length);
        expect(names.length).toBeGreaterThanOrEqual(embedded.length);
        expect(read.pages.map((page) => page.text + page.artifacts).join(' ')).not.toMatch(/�/);
      });

      it('when it is drawn twice, then the bytes are the same', async () => {
        const again = await drawReceipt(documentOf(frozen), TEST_STYLE, NO_ART);

        expect(again).toEqual(bytes);
      });
    });
  }
});

describe('Given a document with a character the receipt fonts lack', () => {
  it('when it is drawn, then it is refused rather than printed as an empty box', async () => {
    const document = documentOf(frozenCase(SINGLE_PERSON_CS));
    const unprintable: ReceiptDocument = {
      ...document,
      donor: {
        ...document.donor,
        lines: [
          { cs: 'Jméno a příjmení: Jana 中 Nováková', en: null },
          ...document.donor.lines.slice(1),
        ],
      },
    };

    await expect(drawReceipt(unprintable, TEST_STYLE, NO_ART)).rejects.toThrow(/U\+4E2D/);
  });
});

const EVERY_PRINTABLE_CHARACTER = RECEIPT_PRINTABLE_RANGES.flatMap(([first, last]) =>
  Array.from({ length: last - first + 1 }, (_, offset) => String.fromCodePoint(first + offset)),
).join('');

const NAMES_IN_OTHER_SCRIPTS: readonly { script: string; name: string }[] = [
  { script: 'Romanian', name: 'Ștefan Țurcanu' },
  { script: 'Vietnamese', name: 'Nguyễn Văn An' },
  { script: 'Ukrainian Cyrillic', name: 'Марʼяна Ковальчук' },
  { script: 'Greek', name: 'Γιώργος Παπαδόπουλος' },
];

for (const theme of RECEIPT_THEMES) {
  describe(`Given the receipt fonts of the ${theme} theme`, () => {
    it('when a receipt whose title, bold headings and lines hold every printable character is drawn, then every character has its glyph in every font', async () => {
      const frozen = frozenCase(SINGLE_PERSON_CS);
      const document = documentOf({
        ...frozen,
        donor: { ...frozen.donor, name: EVERY_PRINTABLE_CHARACTER },
        texts: {
          ...frozen.texts,
          cs: {
            ...frozen.texts.cs,
            'receipt.title.single': EVERY_PRINTABLE_CHARACTER,
            'receipt.donor': EVERY_PRINTABLE_CHARACTER,
          },
        },
      });

      await expect(
        drawReceipt(document, TEST_STYLE, { ...NO_ART, fonts: themeFonts(theme) }),
      ).resolves.toBeInstanceOf(Uint8Array);
    }, 60_000);

    for (const { script, name } of NAMES_IN_OTHER_SCRIPTS) {
      it(`when the receipt of a donor named in ${script} is drawn, then the name reads back from the PDF`, async () => {
        const frozen = frozenCase(SINGLE_PERSON_CS);
        const read = await readPdf(
          await drawReceipt(
            documentOf({ ...frozen, donor: { ...frozen.donor, name } }),
            TEST_STYLE,
            { ...NO_ART, fonts: themeFonts(theme) },
          ),
        );

        expect(read.pages[0].text.normalize('NFC')).toContain(`Jméno a příjmení: ${name}`);
      });
    }
  });
}

const QR_SAMPLES: readonly { gifts: number; name: string }[] = [
  { gifts: 1, name: SINGLE_PERSON_CS },
  { gifts: 40, name: YEARLY_40 },
  { gifts: 120, name: YEARLY_120 },
  { gifts: 366, name: YEARLY_366 },
];

describe('Given receipts of 1, 40, 120 and 366 gifts', () => {
  for (const sample of QR_SAMPLES) {
    for (const dpi of [150, 300]) {
      it(`when the page with the QR code of ${sample.gifts} gifts is rasterised at ${dpi} DPI, blurred and noisy, then the code decodes to the proof`, async () => {
        const frozen = frozenCase(sample.name);
        const bytes = await drawReceipt(documentOf(frozen), TEST_STYLE, NO_ART);
        const read = await readPdf(bytes);
        const page = read.pages.find((each) => each.links.length > 0);
        if (page === undefined) {
          throw new Error('no page links the proof');
        }
        const raster = await rasterPage(bytes, page.number, dpi);
        const [left, bottom, right, top] = page.links[0].rect;
        const scale = dpi / 72;
        const margin = 12 * scale;
        const area = cropped(
          raster,
          left * scale - margin,
          (page.heightPt - top) * scale - margin,
          (right - left) * scale + 2 * margin,
          (top - bottom) * scale + 2 * margin,
        );
        const degraded = noisy(blurred(area, dpi === 150 ? 1 : 2), 10, sample.gifts * dpi);

        expect(decodedQr(degraded)).toBe(frozen.verification.qrText);
      }, 120_000);
    }
  }

  it('when the QR code is placed, then up to version 13 it sits in the 35 mm block and above it in its own area with modules of at least 0.6 mm', () => {
    const versions = QR_SAMPLES.map((sample) => {
      const symbol = verificationSymbol(frozenCase(sample.name).verification.qrText);
      return { version: symbol.version, area: qrPlacement(symbol).area };
    });

    expect(versions).toEqual([
      { version: 9, area: 'inline' },
      { version: 13, area: 'inline' },
      { version: 17, area: 'own' },
      { version: 32, area: 'own' },
    ]);
  });
});

describe('Given a single receipt with a vector signature and a portrait', () => {
  it('when it is drawn, then the signature is vector paths, the portrait the one image, and both are described figures', async () => {
    const frozen = frozenCase(SINGLE_SIGNATURE);
    const document = documentOf({
      ...frozen,
      signatory: { ...frozen.signatory, portraitImage: { sha256: 'a'.repeat(64) } },
    });

    const withArt = await readPdf(
      await drawReceipt(document, TEST_STYLE, {
        fonts: themeFonts(),
        signature: VECTOR_SIGNATURE,
        portrait: PORTRAIT,
      }),
    );
    const withVectorOnly = await readPdf(
      await drawReceipt(document, TEST_STYLE, {
        fonts: themeFonts(),
        signature: VECTOR_SIGNATURE,
        portrait: null,
      }),
    );

    expect(withArt.raw.match(/\/Subtype \/Image/g) ?? []).toHaveLength(1);
    expect(withVectorOnly.raw.match(/\/Subtype \/Image/g) ?? []).toHaveLength(0);
    expect(withArt.figureAlts).toEqual(
      expect.arrayContaining([TEST_CAPTIONS.signatureAlt, TEST_CAPTIONS.portraitAlt]),
    );
  });

  for (const dpi of [150, 300]) {
    it(`when it is rasterised at ${dpi} DPI, then the signature area has ink that the receipt without it lacks`, async () => {
      const frozen = frozenCase(SINGLE_SIGNATURE);
      const document = documentOf(frozen);
      const signed = await rasterPage(
        await drawReceipt(document, TEST_STYLE, { ...NO_ART, signature: VECTOR_SIGNATURE }),
        1,
        dpi,
      );
      const unsigned = await rasterPage(await drawReceipt(document, TEST_STYLE, NO_ART), 1, dpi);
      let differing = 0;
      for (let pixel = 0; pixel < signed.data.length; pixel += 4) {
        if (Math.abs(signed.data[pixel] - unsigned.data[pixel]) > 64) {
          differing++;
        }
      }

      expect(differing).toBeGreaterThan(((dpi / 25.4) * 2) ** 2);
    }, 60_000);
  }
});

describe('Given a year of 12 gifts with the 3B signature block and a portrait', () => {
  it('when it is drawn, then it stays on one page', async () => {
    const document = documentOf(twelveGiftYear());

    const read = await readPdf(
      await drawReceipt(document, TEST_STYLE, {
        fonts: themeFonts(),
        signature: VECTOR_SIGNATURE,
        portrait: PORTRAIT,
      }),
    );

    expect(read.pages).toHaveLength(1);
  });
});

describe('Given the control theme and its own receipt fonts', () => {
  it('when a receipt is drawn with them, then the PDF embeds the control fonts and none of the default theme', async () => {
    const read = await readPdf(
      await drawReceipt(documentOf(frozenCase(SINGLE_PERSON_CS)), TEST_STYLE, {
        ...NO_ART,
        fonts: themeFonts('control'),
      }),
    );

    expect(read.raw).toMatch(/\+DejaVuSans/);
    expect(read.raw).not.toMatch(/\+Inter/);
  });
});

describe('Given a receipt being drawn', () => {
  it('when each page is started, then the progress callback hears its number', async () => {
    const pages: number[] = [];

    await drawReceipt(documentOf(frozenCase(YEARLY_120)), TEST_STYLE, NO_ART, (page) =>
      pages.push(page),
    );

    expect(pages[0]).toBe(1);
    expect(pages).toEqual(pages.map((_, index) => index + 1));
    expect(pages.length).toBeGreaterThan(1);
  });
});
