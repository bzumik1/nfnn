// @vitest-environment node

import { FrozenReceipt } from './frozen-receipt';
import { ReceiptArt } from './receipt-art';
import { receiptCaptions } from './receipt-captions';
import { receiptDocument, ReceiptDocument } from './receipt-document';
import {
  drawReceipt,
  drawReceiptBundle,
  ReceiptArtwork,
  ReceiptBundleItem,
} from './receipt-layout';
import { ReceiptPdfInfo } from './receipt-bundle-options';
import { readPdf, ReadPdf, ReadPage, readXmp } from './testing/pdf-reader';
import {
  frozenCase,
  SINGLE_PERSON_CS,
  SINGLE_SIGNATURE,
  YEARLY_120,
  YEARLY_BILINGUAL,
} from './testing/receipt-fixtures';
import { TEST_STYLE, themeFonts } from './testing/receipt-style-fixture';
import { base64Bytes, SYNTHETIC_PORTRAIT_PNG_BASE64 } from './testing/synthetic-art';

const PORTRAIT: ReceiptArt = { kind: 'raster', bytes: base64Bytes(SYNTHETIC_PORTRAIT_PNG_BASE64) };
const INFO: ReceiptPdfInfo = {
  title: 'Roční potvrzení o daru za rok 2026',
  author: 'Nová naděje',
  subject: '4 potvrzení',
  createdAt: '2027-01-20T10:15:00Z',
};
const ISSUED_AT = [
  '2027-01-15T09:30:00Z',
  '2027-01-16T09:30:00Z',
  '2027-01-17T09:30:00Z',
  '2027-01-18T09:30:00Z',
];

function documentOf(frozen: FrozenReceipt, issuedAt: string): ReceiptDocument {
  return receiptDocument(frozen, issuedAt, receiptCaptions());
}

function withPortrait(frozen: FrozenReceipt): FrozenReceipt {
  return {
    ...frozen,
    signatory: { ...frozen.signatory, portraitImage: { sha256: 'a'.repeat(64) } },
  };
}

function items(): ReceiptBundleItem[] {
  const portrait: ReceiptArtwork = { signature: null, portrait: PORTRAIT };
  return [
    {
      document: documentOf(withPortrait(frozenCase(SINGLE_PERSON_CS)), ISSUED_AT[0]),
      artwork: portrait,
    },
    { document: documentOf(withPortrait(frozenCase(YEARLY_120)), ISSUED_AT[1]), artwork: portrait },
    {
      document: documentOf(frozenCase(YEARLY_BILINGUAL), ISSUED_AT[2]),
      artwork: { signature: null, portrait: null },
    },
    {
      document: documentOf(withPortrait(frozenCase(SINGLE_SIGNATURE)), ISSUED_AT[3]),
      artwork: portrait,
    },
  ];
}

function printed(page: ReadPage): { text: string; artifacts: string } {
  return { text: page.text, artifacts: page.artifacts };
}

async function singles(bundle: readonly ReceiptBundleItem[]): Promise<ReadPdf[]> {
  const read: ReadPdf[] = [];
  for (const item of bundle) {
    read.push(
      await readPdf(
        await drawReceipt(item.document, TEST_STYLE, { fonts: themeFonts(), ...item.artwork }),
      ),
    );
  }
  return read;
}

describe('Given four receipts of one year, one of them running over several pages', () => {
  const bundle = items();
  let single: ReadPdf[];

  beforeAll(async () => {
    single = await singles(bundle);
  }, 120_000);

  describe('when they are drawn into one PDF for one-sided printing', () => {
    let bytes: Uint8Array;
    let read: ReadPdf;
    const heard: number[] = [];

    beforeAll(async () => {
      bytes = await drawReceiptBundle(
        bundle,
        { info: INFO, duplex: false },
        TEST_STYLE,
        themeFonts(),
        (index) => heard.push(index),
      );
      read = await readPdf(bytes);
    }, 120_000);

    it('then the pages of each receipt print exactly what its own PDF prints, footer numbers included', () => {
      let page = 0;
      for (const own of single) {
        const pages = read.pages.slice(page, page + own.pages.length);
        expect(pages.map(printed)).toEqual(own.pages.map(printed));
        page += own.pages.length;
      }
      expect(read.pages).toHaveLength(page);
    });

    it('then each receipt has its own section in one tagged document', () => {
      expect(read.raw.match(/\/S \/Sect\b/g) ?? []).toHaveLength(bundle.length);
      expect(read.raw.match(/\/S \/Document\b/g) ?? []).toHaveLength(1);
      expect(read.roles).toEqual(expect.arrayContaining(['Document', 'Sect', 'H1', 'Figure']));
    });

    it('then the portrait the receipts share is embedded once', () => {
      expect(read.raw.match(/\/Subtype \/Image/g) ?? []).toHaveLength(1);
    });

    it('then its metadata name the bundle and the time given for it', () => {
      const xmp = readXmp(read.raw);

      expect(xmp.wellFormed).toBe(true);
      expect(xmp.values['dc:title']).toBe(INFO.title);
      expect(xmp.values['xmp:CreateDate']).toBe(INFO.createdAt);
    });

    it('then the progress hears every receipt in turn', () => {
      expect(heard).toEqual([0, 1, 2, 3]);
    });

    it('then drawing it again gives the same bytes', async () => {
      const again = await drawReceiptBundle(
        bundle,
        { info: INFO, duplex: false },
        TEST_STYLE,
        themeFonts(),
      );

      expect(again).toEqual(bytes);
    }, 120_000);
  });

  describe('when they are drawn into one PDF for printing on both sides', () => {
    let read: ReadPdf;

    beforeAll(async () => {
      read = await readPdf(
        await drawReceiptBundle(bundle, { info: INFO, duplex: true }, TEST_STYLE, themeFonts()),
      );
    }, 120_000);

    it('then every receipt starts on an odd page, after a blank page where needed, and prints what its own PDF prints', () => {
      let page = 0;
      for (const own of single) {
        if (page % 2 === 1) {
          expect(printed(read.pages[page])).toEqual({ text: '', artifacts: '' });
          page++;
        }
        const pages = read.pages.slice(page, page + own.pages.length);
        expect(pages.map(printed)).toEqual(own.pages.map(printed));
        page += own.pages.length;
      }
      expect(read.pages).toHaveLength(page);
    });
  });
});

describe('Given no receipt at all', () => {
  it('when a bundle is drawn, then it is refused', async () => {
    await expect(
      drawReceiptBundle([], { info: INFO, duplex: false }, TEST_STYLE, themeFonts()),
    ).rejects.toThrow(/at least one receipt/);
  });
});
