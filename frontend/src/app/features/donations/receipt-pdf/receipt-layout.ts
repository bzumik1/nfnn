import PDFDocument, { PdfStructureElement, PdfStructureOptions } from 'pdfkit';
import {
  brandedQrLayout,
  QUIET_ZONE,
  STAR_BODY,
  STAR_FACE,
  STAR_ORIGIN,
} from '../../../shared/ui/qr-code/qr-branded-layout';
import { QrSymbol } from '../../../shared/ui/qr-code/qr-encoder';
import { ReceiptArt } from './receipt-art';
import { Bilingual, ReceiptDocument, ReceiptGiftRow } from './receipt-document';
import { RECEIPT_LOGO } from './receipt-logo';
import { checkedReceiptStyle, ReceiptStyle } from './receipt-style';
import { VectorArt } from './vector-art';
import { qrPlacement, verificationSymbol } from './verification-qr';

export interface ReceiptFonts {
  readonly body: Uint8Array;
  readonly bold: Uint8Array;
  readonly heading: Uint8Array;
}

export interface ReceiptAssets {
  readonly fonts: ReceiptFonts;
  readonly signature: ReceiptArt | null;
  readonly portrait: ReceiptArt | null;
}

type FontName = 'body' | 'bold' | 'heading';

const XML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};
const XMP_FIELDS = ['Title', 'Author', 'Subject', 'Creator', 'Producer'] as const;

function xmlEscaped(text: string): string {
  return text.replace(/[&<>"']/g, (character) => XML_ESCAPES[character]);
}

function escapingXmp(doc: PDFDocument): PDFDocument {
  const endMetadata = doc.endMetadata.bind(doc);
  doc.endMetadata = () => {
    for (const field of XMP_FIELDS) {
      const value = doc.info[field];
      if (typeof value === 'string') {
        doc.info[field] = xmlEscaped(value);
      }
    }
    endMetadata();
  };
  return doc;
}

interface Piece {
  readonly text: string;
  readonly font: FontName;
  readonly size: number;
  readonly color: string;
}

const MM = 72 / 25.4;
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const LOGO_WIDTH = 58 * MM;
const LOGO_COLUMN = 60 * MM;
const TITLE_GAP = 1.5 * MM;
const SECTION_GAP = 4 * MM;
const LINE_GAP = 1 * MM;
const PARTY_GAP = 6 * MM;
const NOTICE_PADDING = 3 * MM;
const CELL_PADDING_X = 2 * MM;
const HEAD_PADDING_Y = 1.5 * MM;
const ROW_PADDING_Y = 0.6 * MM;
const TABLE_GAP = 2 * MM;
const SIGNATURE_GAP = 5 * MM;
const CARD_WIDTH = 106 * MM;
const CARD_PADDING = 4 * MM;
const CARD_RADIUS = 2 * MM;
const CARD_GAP = 6 * MM;
const PORTRAIT_SIZE = 26 * MM;
const PORTRAIT_GAP = 5 * MM;
const SIGNATURE_WIDTH = 60 * MM;
const SIGNATURE_HEIGHT = 18 * MM;
const BLANK_SIGNATURE = 12 * MM;
const QR_GAP = 2 * MM;
const QR_CAPTION_GAP = 5 * MM;
const CARD_CAPTION_GAP = 3 * MM;
const OWN_QR_GAP = 8 * MM;
const QUIET_ZONE_MODULES = 4;
const STAR_BADGE_SHARE = 0.12;
const DOT_RADIUS = 0.45;
const ALIGNMENT_DOT_RADIUS = 0.5;
const BADGE_LINE_INSET = 0.7;
const BADGE_LINE_WIDTH = 0.25;
const STAR_LINE_WIDTH = 20;
const FOOTER_RULE = 3 * MM;
const FOOTER_TEXT = 6 * MM;
const HAIRLINE = 0.5;
const STRONG_RULE = 0.75;

function joined(chunks: readonly Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

class ReceiptLayout {
  private readonly doc: PDFDocument;
  private readonly root: PdfStructureElement;
  private readonly left: number;
  private readonly width: number;
  private readonly bottom: number;
  private readonly symbol: QrSymbol;
  private page = 1;
  private y: number;

  constructor(
    private readonly document: ReceiptDocument,
    private readonly style: ReceiptStyle,
    private readonly assets: ReceiptAssets,
    private readonly onPage: (page: number) => void,
  ) {
    this.symbol = verificationSymbol(document.verification.qrText);
    const issuedAt = new Date(document.issuedAt);
    this.doc = escapingXmp(
      new PDFDocument({
        size: [A4_WIDTH, A4_HEIGHT],
        margins: {
          top: style.margins.top,
          right: style.margins.right,
          bottom: 0,
          left: style.margins.left,
        },
        font: assets.fonts.body,
        bufferPages: true,
        tagged: true,
        lang: 'cs',
        pdfVersion: '1.7',
        subset: 'PDF/UA',
        displayTitle: true,
        info: {
          Title: document.title.cs,
          Author: document.author,
          Subject: document.numberLine.cs,
          Creator: document.author,
          Producer: document.author,
          CreationDate: issuedAt,
          ModDate: issuedAt,
        },
      }),
    );
    this.doc.registerFont('body', assets.fonts.body);
    this.doc.registerFont('bold', assets.fonts.bold);
    this.doc.registerFont('heading', assets.fonts.heading);
    this.root = this.doc.struct('Document');
    this.doc.addStructure(this.root);
    this.left = style.margins.left;
    this.width = A4_WIDTH - style.margins.left - style.margins.right;
    this.bottom = A4_HEIGHT - style.margins.bottom;
    this.y = style.margins.top;
  }

  draw(): Promise<Uint8Array> {
    const chunks: Uint8Array[] = [];
    const ended = new Promise<Uint8Array>((resolve) =>
      this.doc.on('end', () => resolve(joined(chunks))),
    );
    this.doc.on('data', (chunk) => chunks.push(chunk));
    this.onPage(this.page);
    this.header();
    this.replaces();
    this.parties();
    this.gifts();
    this.closing();
    this.root.end();
    this.footers();
    this.doc.end();
    return ended;
  }

  private get colors(): ReceiptStyle['colors'] {
    return this.style.colors;
  }

  private get sizes(): ReceiptStyle['sizes'] {
    return this.style.sizes;
  }

  private use(font: FontName, size: number): number {
    this.doc.font(font).fontSize(size);
    return size * this.style.leading - this.doc.currentLineHeight();
  }

  private refuseMissingGlyphs(text: string): void {
    const font = this.doc._font.font;
    for (const character of text) {
      const codePoint = character.codePointAt(0) ?? 0;
      if (!font.hasGlyphForCodePoint(codePoint)) {
        const hex = codePoint.toString(16).toUpperCase().padStart(4, '0');
        throw new Error(`The receipt fonts have no glyph for U+${hex}.`);
      }
    }
  }

  private measure(text: string, font: FontName, size: number, width: number): number {
    const lineGap = this.use(font, size);
    return this.doc.heightOfString(text, { width, lineGap });
  }

  private write(
    text: string,
    font: FontName,
    size: number,
    color: string,
    x: number,
    width: number,
    align: 'left' | 'right' = 'left',
  ): void {
    const lineGap = this.use(font, size);
    this.refuseMissingGlyphs(text);
    this.doc.fillColor(color).text(text, x, this.y, { width, align, lineGap });
    this.y += this.doc.heightOfString(text, { width, lineGap });
  }

  private widthOf(piece: Piece): number {
    this.use(piece.font, piece.size);
    return this.doc.widthOfString(piece.text);
  }

  private ascent(font: FontName, size: number): number {
    this.use(font, size);
    return (this.doc._font.ascender / 1000) * size;
  }

  private writeOnBaseline(piece: Piece, x: number, baseline: number): void {
    this.use(piece.font, piece.size);
    this.refuseMissingGlyphs(piece.text);
    this.doc
      .fillColor(piece.color)
      .text(piece.text, x, baseline, { lineBreak: false, baseline: 'alphabetic' });
  }

  private element(type: string, options: PdfStructureOptions, parent: PdfStructureElement) {
    const element = this.doc.struct(type, options);
    parent.add(element);
    return element;
  }

  private tagged(
    type: string,
    draw: () => void,
    parent: PdfStructureElement = this.root,
    options: PdfStructureOptions = {},
  ): void {
    const element = this.element(type, options, parent);
    element.add(draw);
    element.end();
  }

  private bilingual(
    type: string,
    value: Bilingual,
    drawCs: () => void,
    drawEn: (en: string) => void,
    parent: PdfStructureElement = this.root,
  ): void {
    const element = this.element(type, {}, parent);
    element.add(drawCs);
    const en = value.en;
    if (en !== null) {
      const span = this.element('Span', { lang: 'en' }, element);
      span.add(() => drawEn(en));
      span.end();
    }
    element.end();
  }

  private artifact(draw: () => void, type: 'Pagination' | 'Layout' = 'Layout'): void {
    this.doc.markContent('Artifact', { type });
    draw();
    this.doc.endMarkedContent();
  }

  private rule(x: number, y: number, width: number, color: string, thickness = HAIRLINE): void {
    this.artifact(() => {
      this.doc
        .lineWidth(thickness)
        .strokeColor(color)
        .moveTo(x, y)
        .lineTo(x + width, y)
        .stroke();
    });
  }

  private lineHeight(
    value: Bilingual,
    width: number,
    font: FontName = 'body',
    size = this.sizes.body,
  ) {
    return (
      this.measure(value.cs, font, size, width) +
      (value.en === null ? 0 : this.measure(value.en, 'body', this.sizes.small, width))
    );
  }

  private line(
    value: Bilingual,
    x: number,
    width: number,
    parent: PdfStructureElement = this.root,
    font: FontName = 'body',
    color = this.colors.text,
    size = this.sizes.body,
  ): void {
    this.bilingual(
      'P',
      value,
      () => this.write(value.cs, font, size, color, x, width),
      (en) => this.write(en, 'body', this.sizes.small, this.colors.english, x, width),
      parent,
    );
  }

  private newPage(): void {
    this.doc.addPage();
    this.page++;
    this.y = this.style.margins.top;
    this.onPage(this.page);
  }

  private keep(height: number): void {
    if (this.y + height > this.bottom && this.y > this.style.margins.top) {
      this.newPage();
    }
  }

  private header(): void {
    const top = this.y;
    const logoHeight = (LOGO_WIDTH * RECEIPT_LOGO.viewBox[3]) / RECEIPT_LOGO.viewBox[2];
    this.tagged(
      'Figure',
      () => this.vector(RECEIPT_LOGO, this.left, top, LOGO_WIDTH, logoHeight),
      this.root,
      {
        alt: this.document.logoAlt,
      },
    );
    const x = this.left + LOGO_COLUMN;
    const width = this.width - LOGO_COLUMN;
    const title = this.document.title;
    this.bilingual(
      'H1',
      title,
      () => this.write(title.cs, 'heading', this.sizes.title, this.colors.text, x, width, 'right'),
      (en) => this.write(en, 'body', this.sizes.small, this.colors.english, x, width, 'right'),
    );
    this.y += TITLE_GAP;
    for (const value of [this.document.numberLine, this.document.issuedOnLine]) {
      this.bilingual(
        'P',
        value,
        () => this.write(value.cs, 'body', this.sizes.body, this.colors.text, x, width, 'right'),
        (en) => this.write(en, 'body', this.sizes.small, this.colors.english, x, width, 'right'),
      );
    }
    this.y = Math.max(this.y, top + logoHeight);
  }

  private replaces(): void {
    const replaces = this.document.replaces;
    if (replaces === null) {
      return;
    }
    this.y += SECTION_GAP + TITLE_GAP;
    const inner = this.width - 2 * NOTICE_PADDING;
    const height = this.lineHeight(replaces, inner, 'bold') + 2 * NOTICE_PADDING;
    const top = this.y;
    this.artifact(() => {
      this.doc.rect(this.left, top, this.width, height).fill(this.colors.notice);
      this.doc
        .lineWidth(STRONG_RULE)
        .rect(this.left, top, this.width, height)
        .stroke(this.colors.noticeBorder);
    });
    this.y = top + NOTICE_PADDING;
    this.line(replaces, this.left + NOTICE_PADDING, inner, this.root, 'bold');
    this.y = top + height;
  }

  private partyHeading(heading: Bilingual, x: number, width: number): void {
    const baseline = this.y + this.ascent('bold', this.sizes.heading);
    const element = this.element('H2', {}, this.root);
    element.add(() =>
      this.writeOnBaseline(
        { text: heading.cs, font: 'bold', size: this.sizes.heading, color: this.colors.text },
        x,
        baseline,
      ),
    );
    const en = heading.en;
    if (en !== null) {
      const piece: Piece = {
        text: `/ ${en}`,
        font: 'body',
        size: this.sizes.small,
        color: this.colors.english,
      };
      const after =
        x +
        this.widthOf({ text: `${heading.cs} `, font: 'bold', size: this.sizes.heading, color: '' });
      const span = this.element('Span', { lang: 'en' }, element);
      span.add(() => this.writeOnBaseline(piece, after, baseline));
      span.end();
    }
    element.end();
    this.y += this.sizes.heading * this.style.leading + LINE_GAP;
    this.rule(x, this.y, width, this.colors.rule);
    this.y += TITLE_GAP;
  }

  private party(party: ReceiptDocument['donee'], x: number, width: number, top: number): number {
    this.y = top;
    this.partyHeading(party.heading, x, width);
    for (const value of party.lines) {
      this.line(value, x, width);
      this.y += LINE_GAP;
    }
    return this.y;
  }

  private parties(): void {
    this.y += SECTION_GAP;
    const top = this.y;
    const half = this.width / 2;
    const doneeBottom = this.party(this.document.donee, this.left, half - PARTY_GAP, top);
    const donorBottom = this.party(this.document.donor, this.left + half, half, top);
    this.y = Math.max(doneeBottom, donorBottom);
  }

  private gifts(): void {
    const single = this.document.singleGift;
    if (single !== null) {
      this.y += SECTION_GAP - LINE_GAP;
      for (const value of single) {
        this.keep(this.lineHeight(value, this.width));
        this.line(value, this.left, this.width);
        this.y += LINE_GAP;
      }
      return;
    }
    const table = this.document.giftTable;
    if (table === null) {
      return;
    }
    this.y += SECTION_GAP - LINE_GAP;
    this.line(table.account, this.left, this.width);
    this.y += TABLE_GAP;
    this.giftTable(table);
  }

  private headHeight(columns: { receivedOn: Bilingual; amount: Bilingual }): number {
    const english = columns.receivedOn.en !== null;
    return (
      2 * HEAD_PADDING_Y +
      this.sizes.body * this.style.leading +
      (english ? this.sizes.small * this.style.leading : 0)
    );
  }

  private rowHeight(): number {
    return 2 * ROW_PADDING_Y + this.sizes.body * this.style.leading;
  }

  private tableHead(
    columns: { receivedOn: Bilingual; amount: Bilingual },
    row: PdfStructureElement | null,
  ): void {
    const top = this.y;
    const height = this.headHeight(columns);
    this.artifact(() => {
      this.doc.rect(this.left, top, this.width, height).fill(this.colors.tableHead);
    });
    const inner = this.width - 2 * CELL_PADDING_X;
    const cell = (value: Bilingual, align: 'left' | 'right') => () => {
      this.y = top + HEAD_PADDING_Y;
      this.write(
        value.cs,
        'bold',
        this.sizes.body,
        this.colors.text,
        this.left + CELL_PADDING_X,
        inner,
        align,
      );
      if (value.en !== null) {
        this.write(
          value.en,
          'body',
          this.sizes.small,
          this.colors.english,
          this.left + CELL_PADDING_X,
          inner,
          align,
        );
      }
    };
    if (row === null) {
      this.artifact(() => {
        cell(columns.receivedOn, 'left')();
        cell(columns.amount, 'right')();
      }, 'Pagination');
    } else {
      this.tagged('TH', cell(columns.receivedOn, 'left'), row, { scope: 'Column' });
      this.tagged('TH', cell(columns.amount, 'right'), row, { scope: 'Column' });
      row.end();
    }
    this.y = top + height;
    this.rule(this.left, this.y, this.width, this.colors.text, STRONG_RULE);
  }

  private giftRow(gift: ReceiptGiftRow, row: PdfStructureElement): void {
    const top = this.y;
    const baseline = top + ROW_PADDING_Y + this.ascent('body', this.sizes.body);
    const pieces = (value: Bilingual): Piece[] => [
      { text: value.cs, font: 'body', size: this.sizes.body, color: this.colors.text },
      ...(value.en === null
        ? []
        : [
            {
              text: value.en,
              font: 'body' as const,
              size: this.sizes.small,
              color: this.colors.english,
            },
          ]),
    ];
    const space = (piece: Piece) => this.widthOf({ ...piece, text: ' ' });
    const cell = (value: Bilingual, start: number) => {
      const element = this.element('TD', {}, row);
      let x = start;
      pieces(value).forEach((piece, index) => {
        const draw = () => this.writeOnBaseline(piece, x, baseline);
        if (index === 0) {
          element.add(draw);
        } else {
          const span = this.element('Span', { lang: 'en' }, element);
          span.add(draw);
          span.end();
        }
        x += this.widthOf(piece) + space(piece);
      });
      element.end();
    };
    const amountWidth = pieces(gift.amount).reduce(
      (width, piece, index) => width + this.widthOf(piece) + (index > 0 ? space(piece) : 0),
      0,
    );
    cell(gift.receivedOn, this.left + CELL_PADDING_X);
    cell(gift.amount, this.left + this.width - CELL_PADDING_X - amountWidth);
    row.end();
    this.y = top + this.rowHeight();
    this.rule(this.left, this.y, this.width, this.colors.rowRule);
  }

  private giftTable(table: NonNullable<ReceiptDocument['giftTable']>): void {
    this.keep(this.headHeight(table.columns) + this.rowHeight());
    const element = this.element('Table', {}, this.root);
    this.tableHead(table.columns, this.element('TR', {}, element));
    for (const gift of table.rows) {
      if (this.y + this.rowHeight() > this.bottom) {
        this.newPage();
        this.tableHead(table.columns, null);
      }
      this.giftRow(gift, this.element('TR', {}, element));
    }
    element.end();
    this.y += TABLE_GAP;
    const totals =
      this.lineHeight(table.count, this.width) + this.lineHeight(table.total, this.width, 'bold');
    this.keep(totals);
    this.line(table.count, this.left, this.width);
    this.line(table.total, this.left, this.width, this.root, 'bold');
  }

  private signatureColumns(): { left: number; card: number; text: number; textWidth: number } {
    const card = this.left + this.width - CARD_WIDTH;
    const text =
      card + CARD_PADDING + (this.assets.portrait === null ? 0 : PORTRAIT_SIZE + PORTRAIT_GAP);
    return {
      left: card - CARD_GAP - this.left,
      card,
      text,
      textWidth: card + CARD_WIDTH - CARD_PADDING - text,
    };
  }

  private signatureAreaHeight(): number {
    return this.assets.signature === null ? BLANK_SIGNATURE : SIGNATURE_HEIGHT;
  }

  private cardContentHeight(textWidth: number): number {
    const signature = this.document.signature;
    return (
      this.lineHeight(signature.forFoundation, textWidth) +
      LINE_GAP +
      this.signatureAreaHeight() +
      LINE_GAP +
      this.measure(signature.name, 'bold', this.sizes.body, textWidth) +
      this.measure(signature.role, 'body', this.sizes.body, textWidth)
    );
  }

  private inlineQr(): boolean {
    return qrPlacement(this.symbol).area === 'inline';
  }

  private cardHeight(): number {
    const content = Math.max(
      this.cardContentHeight(this.signatureColumns().textWidth),
      this.assets.portrait === null ? 0 : PORTRAIT_SIZE,
    );
    return content + 2 * CARD_PADDING;
  }

  private captionHeight(width: number, size: number): number {
    const verification = this.document.verification;
    return (
      this.lineHeight(verification.heading, width, 'bold', size) +
      LINE_GAP +
      this.lineHeight(verification.text, width, 'body', size)
    );
  }

  private inlineQrHeight(): number {
    const placement = qrPlacement(this.symbol);
    return placement.symbolMm * MM + QUIET_ZONE_MODULES * placement.moduleMm * MM;
  }

  private signatureRowHeight(): number {
    const columns = this.signatureColumns();
    const left =
      this.lineHeight(this.document.signature.issuedAt, columns.left) +
      (this.inlineQr() ? QR_GAP + this.inlineQrHeight() : 0);
    const right =
      this.cardHeight() +
      (this.inlineQr() ? CARD_CAPTION_GAP + this.captionHeight(CARD_WIDTH, this.sizes.small) : 0);
    return Math.max(right, left);
  }

  private declarationHeight(): number {
    return (
      this.lineHeight(this.document.declaration, this.width) +
      (this.document.bilingual ? TITLE_GAP : 0)
    );
  }

  private closing(): void {
    this.y += SECTION_GAP;
    this.keep(this.declarationHeight() + SIGNATURE_GAP + this.signatureRowHeight());
    const declaration = this.document.declaration;
    this.bilingual(
      'P',
      declaration,
      () =>
        this.write(
          declaration.cs,
          'body',
          this.sizes.body,
          this.colors.text,
          this.left,
          this.width,
        ),
      (en) => {
        this.y += TITLE_GAP;
        this.write(en, 'body', this.sizes.small, this.colors.english, this.left, this.width);
      },
    );
    this.y += SIGNATURE_GAP;
    this.signatureRow();
    if (!this.inlineQr()) {
      this.ownQr();
    }
  }

  private signatureRow(): void {
    const signature = this.document.signature;
    const columns = this.signatureColumns();
    const top = this.y;
    const rowHeight = this.signatureRowHeight();
    this.line(signature.issuedAt, this.left, columns.left);
    const qrTop = this.y + QR_GAP;
    const cardHeight = this.cardHeight();
    this.artifact(() => {
      this.doc
        .roundedRect(columns.card, top, CARD_WIDTH, cardHeight, CARD_RADIUS)
        .fill(this.colors.card);
    });
    const portrait = this.assets.portrait;
    if (portrait !== null) {
      this.tagged(
        'Figure',
        () => this.portrait(portrait, columns.card + CARD_PADDING, top + CARD_PADDING),
        this.root,
        { alt: signature.portraitAlt },
      );
    }
    this.y = top + CARD_PADDING;
    this.line(signature.forFoundation, columns.text, columns.textWidth);
    this.y += LINE_GAP;
    const area = this.y;
    const art = this.assets.signature;
    if (art !== null) {
      this.tagged(
        'Figure',
        () =>
          this.art(
            art,
            columns.text,
            area,
            Math.min(SIGNATURE_WIDTH, columns.textWidth),
            SIGNATURE_HEIGHT,
          ),
        this.root,
        { alt: signature.signatureAlt },
      );
    }
    this.y = area + this.signatureAreaHeight();
    this.rule(columns.text, this.y, columns.textWidth, this.colors.cardRule);
    this.y += LINE_GAP;
    this.tagged('P', () =>
      this.write(
        signature.name,
        'bold',
        this.sizes.body,
        this.colors.text,
        columns.text,
        columns.textWidth,
      ),
    );
    this.tagged('P', () =>
      this.write(
        signature.role,
        'body',
        this.sizes.body,
        this.colors.muted,
        columns.text,
        columns.textWidth,
      ),
    );
    if (this.inlineQr()) {
      const placement = qrPlacement(this.symbol);
      this.qr(this.left, qrTop, placement.moduleMm * MM);
      this.caption(columns.card, top + cardHeight + CARD_CAPTION_GAP, CARD_WIDTH, this.sizes.small);
    }
    this.y = top + rowHeight;
  }

  private ownQr(): void {
    const placement = qrPlacement(this.symbol);
    const size = placement.symbolMm * MM;
    const captionWidth = this.width - size - QR_CAPTION_GAP;
    const captionHeight = this.captionHeight(captionWidth, this.sizes.body);
    const quietZone = QUIET_ZONE_MODULES * placement.moduleMm * MM;
    this.y += OWN_QR_GAP;
    this.keep(Math.max(size + quietZone, captionHeight));
    const top = this.y;
    this.qr(this.left, top, placement.moduleMm * MM);
    this.caption(this.left + size + QR_CAPTION_GAP, top, captionWidth, this.sizes.body);
    this.y = top + Math.max(size, captionHeight);
  }

  private caption(x: number, top: number, width: number, size: number): void {
    const verification = this.document.verification;
    this.y = top;
    this.line(verification.heading, x, width, this.root, 'bold', this.colors.text, size);
    this.y += LINE_GAP;
    this.line(verification.text, x, width, this.root, 'body', this.colors.muted, size);
  }

  private qr(x: number, y: number, module: number): void {
    const symbol = this.symbol;
    const size = symbol.size * module;
    const link = this.element('Link', {}, this.root);
    this.tagged(
      'Figure',
      () => {
        this.brandedQr(x, y, module);
      },
      link,
      { alt: this.document.verification.alt },
    );
    this.doc.link(x, y, size, size, this.document.verification.qrText, {
      structParent: link,
      Contents: new String(this.document.verification.alt),
    });
    link.end();
  }

  private brandedQr(x: number, y: number, module: number): void {
    const symbol = this.symbol;
    const badged = symbol.errorCorrection === 'H';
    const layout = brandedQrLayout(symbol.size, badged ? STAR_BADGE_SHARE : null);
    const doc = this.doc;
    doc.save();
    doc.translate(x - QUIET_ZONE * module, y - QUIET_ZONE * module);
    doc.scale(module);
    for (const position of layout.positions) {
      if (symbol.modules[position.row * symbol.size + position.column] === '1') {
        doc.circle(position.cx, position.cy, DOT_RADIUS);
      }
    }
    doc.fill(this.colors.code);
    for (const finder of layout.finders) {
      doc.path(finder.ring).fill(this.colors.codeMark, 'even-odd');
      doc.path(finder.core).fill(this.colors.codeMark);
    }
    for (const alignment of layout.alignments) {
      doc.path(alignment.ring).fill(this.colors.codeMark, 'even-odd');
      doc.circle(alignment.cx, alignment.cy, ALIGNMENT_DOT_RADIUS).fill(this.colors.codeMark);
    }
    if (badged) {
      this.star(layout.centre, layout.badgeRadius, layout.star);
    }
    doc.restore();
  }

  private star(
    centre: number,
    radius: number,
    star: { readonly x: number; readonly y: number; readonly scale: number },
  ): void {
    const doc = this.doc;
    doc.circle(centre, centre, radius).fill(this.colors.codeMark);
    doc
      .circle(centre, centre, radius - BADGE_LINE_INSET)
      .lineWidth(BADGE_LINE_WIDTH)
      .stroke(this.colors.codeStarFill);
    doc.save();
    doc.translate(star.x, star.y);
    doc.scale(star.scale);
    doc.translate(-STAR_ORIGIN.x, -STAR_ORIGIN.y);
    doc.lineWidth(STAR_LINE_WIDTH).lineCap('round').lineJoin('round');
    doc.path(STAR_BODY).fill(this.colors.codeStarFill);
    doc.path(STAR_BODY).stroke(this.colors.codeStar);
    for (const stroke of STAR_FACE) {
      doc.path(stroke).stroke(this.colors.codeStar);
    }
    doc.restore();
  }

  private vector(art: VectorArt, x: number, y: number, width: number, height: number): void {
    const [viewX, viewY, viewWidth, viewHeight] = art.viewBox;
    const scale = Math.min(width / viewWidth, height / viewHeight);
    this.doc.save();
    this.doc.rect(x, y, width, height).clip();
    this.doc.translate(x - viewX * scale, y - viewY * scale);
    this.doc.scale(scale);
    for (const path of art.paths) {
      this.doc.fillColor(path.fill, path.opacity);
      this.doc.path(path.d).fill();
    }
    this.doc.restore();
  }

  private art(art: ReceiptArt, x: number, y: number, width: number, height: number): void {
    if (art.kind === 'vector') {
      this.vector(art.art, x, y, width, height);
    } else {
      this.doc.image(art.bytes, x, y, { fit: [width, height], valign: 'bottom' });
    }
  }

  private portrait(art: ReceiptArt, x: number, y: number): void {
    const radius = PORTRAIT_SIZE / 2;
    this.doc.save();
    this.doc.circle(x + radius, y + radius, radius).clip();
    if (art.kind === 'vector') {
      this.vector(art.art, x, y, PORTRAIT_SIZE, PORTRAIT_SIZE);
    } else {
      this.doc.image(art.bytes, x, y, {
        cover: [PORTRAIT_SIZE, PORTRAIT_SIZE],
        align: 'center',
        valign: 'center',
      });
    }
    this.doc.restore();
  }

  private footers(): void {
    const { start, count } = this.doc.bufferedPageRange();
    for (let index = start; index < start + count; index++) {
      this.doc.switchToPage(index);
      this.artifact(() => {
        this.doc
          .lineWidth(HAIRLINE)
          .strokeColor(this.colors.rule)
          .moveTo(this.left, this.bottom + FOOTER_RULE)
          .lineTo(this.left + this.width, this.bottom + FOOTER_RULE)
          .stroke();
        const number = `${index - start + 1} / ${count}`;
        const numberWidth = this.widthOf({
          text: number,
          font: 'body',
          size: this.sizes.small,
          color: this.colors.muted,
        });
        this.y = this.bottom + FOOTER_TEXT;
        this.write(
          this.document.footer,
          'body',
          this.sizes.small,
          this.colors.muted,
          this.left,
          this.width - numberWidth - PARTY_GAP,
        );
        this.y = this.bottom + FOOTER_TEXT;
        this.write(
          number,
          'body',
          this.sizes.small,
          this.colors.muted,
          this.left,
          this.width,
          'right',
        );
      }, 'Pagination');
    }
  }
}

export async function drawReceipt(
  document: ReceiptDocument,
  style: ReceiptStyle,
  assets: ReceiptAssets,
  onPage: (page: number) => void = () => undefined,
): Promise<Uint8Array> {
  return new ReceiptLayout(document, checkedReceiptStyle(style), assets, onPage).draw();
}
