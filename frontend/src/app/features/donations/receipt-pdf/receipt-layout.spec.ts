// @vitest-environment node

import { sharedCases } from '../../../../testing/shared-cases';
import { FrozenReceipt } from './frozen-receipt';
import { ReceiptArt } from './receipt-art';
import { receiptCaptions } from './receipt-captions';
import { estimatedReceiptPages, receiptDocument, ReceiptDocument } from './receipt-document';
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
  readXmp,
} from './testing/pdf-reader';
import {
  frozenCase,
  SINGLE_PERSON_CS,
  SINGLE_PERSON_EN,
  SINGLE_SIGNATURE,
  YEARLY_120,
  YEARLY_BILINGUAL,
  YEARLY_LEAP_BILINGUAL,
  YEARLY_366,
  YEARLY_40,
} from './testing/receipt-fixtures';
import { TEST_STYLE, themeFonts, themeStyle } from './testing/receipt-style-fixture';
import {
  base64Bytes,
  SYNTHETIC_PORTRAIT_PNG_BASE64,
  SYNTHETIC_SIGNATURE_JSON,
} from './testing/synthetic-art';

const ISSUED_AT = '2027-01-15T09:30:00Z';
const RECEIPT_THEMES = ['nova-nadeje', 'control'] as const;
const A4 = { width: 595.28, height: 841.89 };
const MM = 72 / 25.4;
const FOOTER_RULE_BELOW_MARGIN = 3 * MM;
const QUIET_ZONE_MODULES = 4;
const CAPTIONS = receiptCaptions();
const CZECH_CAPTION_PHRASES = [CAPTIONS.verificationHeading.cs, CAPTIONS.verificationText.cs];
const ENGLISH_CAPTION_PHRASES = [
  CAPTIONS.verificationHeading.en ?? '',
  CAPTIONS.verificationText.en ?? '',
];
const PAGES_BEYOND_V2: Readonly<Record<(typeof RECEIPT_THEMES)[number], Record<string, number>>> = {
  'nova-nadeje': { [YEARLY_BILINGUAL]: 1, [YEARLY_LEAP_BILINGUAL]: 1, [YEARLY_366]: -2 },
  control: { [YEARLY_LEAP_BILINGUAL]: 1, [YEARLY_366]: -2 },
};

const NO_ART: ReceiptAssets = { fonts: themeFonts(), signature: null, portrait: null };
const VECTOR_SIGNATURE: ReceiptArt = {
  kind: 'vector',
  art: parseVectorArt(SYNTHETIC_SIGNATURE_JSON),
};
const PORTRAIT: ReceiptArt = { kind: 'raster', bytes: base64Bytes(SYNTHETIC_PORTRAIT_PNG_BASE64) };

function documentOf(frozen: FrozenReceipt): ReceiptDocument {
  return receiptDocument(frozen, ISSUED_AT, CAPTIONS);
}

function withoutOnce(text: string, phrase: string): string {
  const at = text.indexOf(phrase);
  return at < 0 ? text : normalised(text.slice(0, at) + ' ' + text.slice(at + phrase.length));
}

function textBelowTheMargin(read: ReadPdf, bottomMarginPt: number): readonly string[] {
  return read.pages.flatMap((page) =>
    page.placed
      .filter((placed) => placed.baselinePt < bottomMarginPt)
      .map(
        (placed) =>
          `page ${page.number}: "${placed.text}" ${((bottomMarginPt - placed.baselinePt) / MM).toFixed(1)} mm below the margin`,
      ),
  );
}

function quietZonesOverTheFooterRule(
  read: ReadPdf,
  frozen: FrozenReceipt,
  bottomMarginPt: number,
): readonly string[] {
  const modules = verificationSymbol(frozen.verification.qrText).size;
  return read.pages.flatMap((page) =>
    page.links
      .filter((link) => {
        const [left, bottom, right] = link.rect;
        const quietZone = (QUIET_ZONE_MODULES * (right - left)) / modules;
        return bottom - quietZone < bottomMarginPt - FOOTER_RULE_BELOW_MARGIN + 0.01;
      })
      .map(
        (link) =>
          `page ${page.number}: the QR code ends ${(link.rect[1] / MM).toFixed(1)} mm above the page edge`,
      ),
  );
}

function yearOf(base: FrozenReceipt, gifts: number): FrozenReceipt {
  const many = Array.from({ length: gifts }, (_, index) => base.gifts[index % base.gifts.length]);
  return {
    ...base,
    gifts: many,
    total: { ...base.total, amountMinor: many.reduce((sum, gift) => sum + gift.amountMinor, 0) },
  };
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

  for (const theme of RECEIPT_THEMES) {
    for (const sharedCase of sharedCases('receipts/v1/frozen.json')) {
      describe(`Given the shared case ${sharedCase.name}, drawn in the ${theme} theme with the captions the site prints`, () => {
        const expected = printed.get(sharedCase.name);
        const frozen = structuredClone(sharedCase.expected) as FrozenReceipt;
        let style: ReturnType<typeof themeStyle>;
        let bytes: Uint8Array;
        let read: ReadPdf;

        beforeAll(async () => {
          style = themeStyle(theme);
          bytes = await drawReceipt(documentOf(frozen), style, {
            ...NO_ART,
            fonts: themeFonts(theme),
          });
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
          for (const phrase of [...CZECH_CAPTION_PHRASES, ...ENGLISH_CAPTION_PHRASES]) {
            body = withoutOnce(body, phrase);
          }

          expect(body).toBe(expected?.body);
        });

        it('when it is drawn, then each caption beside the QR code is printed exactly once, its English half only on a bilingual receipt', () => {
          const body = normalised(read.pages.map((page) => page.text).join(' '));
          const bilingual = frozen.locale === 'en';

          expect(CZECH_CAPTION_PHRASES.map((phrase) => occurrences(body, phrase))).toEqual([1, 1]);
          expect(ENGLISH_CAPTION_PHRASES.map((phrase) => occurrences(body, phrase))).toEqual(
            bilingual ? [1, 1] : [0, 0],
          );
        });

        it('when it is drawn, then no text outside the page artifacts lies below the bottom margin, so nothing reaches the footer rule', () => {
          expect(textBelowTheMargin(read, style.margins.bottom)).toEqual([]);
        });

        it('when it is drawn, then the QR code and its quiet zone of four modules end above the footer rule', () => {
          expect(quietZonesOverTheFooterRule(read, frozen, style.margins.bottom)).toEqual([]);
        });

        it('when it is drawn, then its XMP metadata is well-formed XML naming PDF/UA part 1, the Czech title and the issue time', () => {
          const xmp = readXmp(read.raw);

          expect(xmp.wellFormed).toBe(true);
          expect(xmp.values['pdfuaid:part']).toBe('1');
          expect(xmp.values['dc:title']).toBe(documentOf(frozen).title.cs);
          expect(xmp.values['dc:creator']).toBe(frozen.foundation.name);
          expect(xmp.values['xmp:CreateDate']).toBe(ISSUED_AT);
        });

        it('when it is drawn, then every page is A4 and carries the footer with its number as a pagination artifact', () => {
          const count = read.pages.length;
          for (const page of read.pages) {
            expect(page.widthPt).toBeCloseTo(A4.width, 1);
            expect(page.heightPt).toBeCloseTo(A4.height, 1);
            expect(page.artifacts).toContain(`${expected?.footer} ${page.number} / ${count}`);
          }
        });

        it('when it is drawn, then it has exactly as many pages as v2 had, apart from the listed differences', () => {
          expect(read.pages.length).toBe(
            (expected?.v2Pages ?? 0) + (PAGES_BEYOND_V2[theme][sharedCase.name] ?? 0),
          );
        });

        if (theme === 'nova-nadeje') {
          it('when it is drawn in the default theme, then the page count the progress bar expects for its gifts is its page count', () => {
            expect(estimatedReceiptPages(frozen.gifts.length, documentOf(frozen).bilingual)).toBe(
              read.pages.length,
            );
          });
        }

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
          expect(read.figureAlts).toContain(CAPTIONS.verificationAlt);
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
          const again = await drawReceipt(documentOf(frozen), style, {
            ...NO_ART,
            fonts: themeFonts(theme),
          });

          expect(again).toEqual(bytes);
        }, 60_000);
      });
    }
  }
});

describe('Given the default theme and the style the specs draw with', () => {
  it("when the theme's receipt tokens are read, then they give that style, the font file names aside", () => {
    expect({ ...themeStyle('nova-nadeje'), fonts: TEST_STYLE.fonts }).toEqual(TEST_STYLE);
  });
});

describe('Given a bilingual year of 1 to 12 gifts, drawn with the captions the site prints', () => {
  for (const theme of RECEIPT_THEMES) {
    it(`when each is drawn in the ${theme} theme, then no text lies below the bottom margin and the QR code clears the footer rule`, async () => {
      const style = themeStyle(theme);
      const problems: string[] = [];
      for (let gifts = 1; gifts <= 12; gifts++) {
        const frozen = yearOf(frozenCase(YEARLY_BILINGUAL), gifts);
        const read = await readPdf(
          await drawReceipt(documentOf(frozen), style, { ...NO_ART, fonts: themeFonts(theme) }),
        );
        problems.push(
          ...[
            ...textBelowTheMargin(read, style.margins.bottom),
            ...quietZonesOverTheFooterRule(read, frozen, style.margins.bottom),
          ].map((problem) => `${gifts} gifts, ${problem}`),
        );
      }

      expect(problems).toEqual([]);
    }, 120_000);
  }
});

describe('Given a year whose QR code needs an area of its own', () => {
  it('when it is drawn with 13 to 60 gifts, then on every draw the QR code with its quiet zone ends above the bottom margin', async () => {
    const problems: string[] = [];
    const base = frozenCase(YEARLY_120);
    const modules = verificationSymbol(base.verification.qrText).size;
    for (let gifts = 13; gifts <= 60; gifts++) {
      const read = await readPdf(
        await drawReceipt(documentOf(yearOf(base, gifts)), TEST_STYLE, NO_ART),
      );
      for (const page of read.pages) {
        for (const link of page.links) {
          const [left, bottom, right] = link.rect;
          const quietZone = (QUIET_ZONE_MODULES * (right - left)) / modules;
          if (bottom - quietZone < TEST_STYLE.margins.bottom - 0.01) {
            problems.push(
              `${gifts} gifts: the quiet zone ends ${((TEST_STYLE.margins.bottom - bottom + quietZone) / MM).toFixed(1)} mm below the margin`,
            );
          }
        }
      }
    }

    expect(problems).toEqual([]);
  }, 180_000);
});

describe('Given a foundation name with the characters XML reserves', () => {
  it('when a receipt is drawn, then its XMP stays well-formed and still names the foundation as written', async () => {
    const frozen = frozenCase(SINGLE_PERSON_CS);
    const name = 'Fond A & B <x> "C"';
    const read = await readPdf(
      await drawReceipt(
        documentOf({ ...frozen, foundation: { ...frozen.foundation, name } }),
        TEST_STYLE,
        NO_ART,
      ),
    );
    const xmp = readXmp(read.raw);

    expect(xmp.wellFormed).toBe(true);
    expect(xmp.values['dc:creator']).toBe(name);
  });
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

describe('Given single receipts whose QR code stands beside the signature', () => {
  for (const name of [SINGLE_PERSON_CS, SINGLE_PERSON_EN]) {
    it(`when ${name} is drawn, then the caption of the code lies beside the code, under the signature card`, async () => {
      const read = await readPdf(
        await drawReceipt(documentOf(frozenCase(name)), TEST_STYLE, NO_ART),
      );
      const page = read.pages.find((each) => each.links.length > 0);
      if (page === undefined) {
        throw new Error('no page links the proof');
      }
      const [, codeBottom, codeRight, codeTop] = page.links[0].rect;
      const heading = page.placed.filter(
        (placed) => placed.text.trim() === CAPTIONS.verificationHeading.cs,
      );
      const card = page.placed.filter((placed) =>
        placed.text.includes(frozenCase(name).signatory.role),
      );

      expect(heading.length).toBe(1);
      expect(heading[0].leftPt).toBeGreaterThan(codeRight);
      expect(heading[0].baselinePt).toBeLessThan(codeTop);
      expect(heading[0].baselinePt).toBeGreaterThan(codeBottom);
      expect(card.length).toBeGreaterThan(0);
      expect(heading[0].baselinePt).toBeLessThan(card[0].baselinePt);
    }, 60_000);
  }
});

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

  it('when the QR code is placed, then up to version 15 it stands beside the signature and above it in its own area', () => {
    const versions = QR_SAMPLES.map((sample) => {
      const symbol = verificationSymbol(frozenCase(sample.name).verification.qrText);
      return { version: symbol.version, area: qrPlacement(symbol).area };
    });

    expect(versions).toEqual([
      { version: 13, area: 'inline' },
      { version: 19, area: 'own' },
      { version: 28, area: 'own' },
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
      expect.arrayContaining([CAPTIONS.signatureAlt, CAPTIONS.portraitAlt]),
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

describe('Given a vector signature whose paths reach far outside its view box', () => {
  it('when it is drawn, then its ink stays inside the 60 × 18 mm signature area', async () => {
    const dpi = 100;
    const pixelsPerMm = dpi / 25.4;
    const sprawling: ReceiptArt = {
      kind: 'vector',
      art: parseVectorArt(
        '{"viewBox":[0,0,100,30],"paths":[{"d":"M-900 -900 L900 -900 L900 900 L-900 900 Z","fill":"#000000","opacity":1}]}',
      ),
    };
    const document = documentOf(frozenCase(SINGLE_SIGNATURE));
    const signed = await rasterPage(
      await drawReceipt(document, TEST_STYLE, { ...NO_ART, signature: sprawling }),
      1,
      dpi,
    );
    const unsigned = await rasterPage(
      await drawReceipt(document, TEST_STYLE, { ...NO_ART, signature: VECTOR_SIGNATURE }),
      1,
      dpi,
    );
    let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
    for (let pixel = 0; pixel < signed.data.length; pixel += 4) {
      if (Math.abs(signed.data[pixel] - unsigned.data[pixel]) > 64) {
        const x = (pixel / 4) % signed.width;
        const y = Math.floor(pixel / 4 / signed.width);
        [minX, minY, maxX, maxY] = [
          Math.min(minX, x),
          Math.min(minY, y),
          Math.max(maxX, x),
          Math.max(maxY, y),
        ];
      }
    }

    expect((maxX - minX + 1) / pixelsPerMm).toBeLessThanOrEqual(60.5);
    expect((maxY - minY + 1) / pixelsPerMm).toBeLessThanOrEqual(18.5);
  }, 60_000);
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

describe('Given the receipt fonts of the default theme, cut from Inter and Playfair Display', () => {
  it("when a receipt is drawn with them, then the embedded fonts carry the receipt's own family names and none of the reserved font names", async () => {
    const read = await readPdf(
      await drawReceipt(documentOf(frozenCase(SINGLE_PERSON_CS)), TEST_STYLE, NO_ART),
    );

    expect(read.raw).toMatch(/\/BaseFont \/[A-Z]{6}\+NFNNReceiptSans-Regular/);
    expect(read.raw).toMatch(/\/BaseFont \/[A-Z]{6}\+NFNNReceiptSerif-Bold/);
    expect(read.raw).not.toMatch(/\/BaseFont \/[A-Z]{6}\+(?:Inter|PlayfairDisplay)/);
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

    expect(read.raw).toMatch(/\+NFNNReceiptControlSans-Regular/);
    expect(read.raw).not.toMatch(/\+NFNNReceiptSans/);
  });
});

describe('Given a style whose text would not show on the white page', () => {
  it('when a receipt is drawn with it, then the drawing is refused rather than giving a blank page', async () => {
    const faint = { ...TEST_STYLE, colors: { ...TEST_STYLE.colors, text: '#ffffff' } };

    await expect(
      drawReceipt(documentOf(frozenCase(SINGLE_PERSON_CS)), faint, NO_ART),
    ).rejects.toThrow(/contrast/);
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
