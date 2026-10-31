declare module 'pdfkit' {
  type PdfString = object;

  interface PdfStructureOptions {
    readonly alt?: string;
    readonly lang?: string;
    readonly title?: string;
    readonly actual?: string;
    readonly scope?: 'Row' | 'Column' | 'Both';
  }

  interface PdfStructureElement {
    add(child: PdfStructureElement | (() => void)): PdfStructureElement;
    end(): void;
  }

  interface PdfTextOptions {
    readonly width?: number;
    readonly height?: number;
    readonly align?: 'left' | 'right' | 'center' | 'justify';
    readonly lineGap?: number;
    readonly lineBreak?: boolean;
    readonly continued?: boolean;
    readonly characterSpacing?: number;
    readonly features?: readonly string[];
    readonly baseline?: 'alphabetic' | 'top';
  }

  interface PdfImageOptions {
    readonly width?: number;
    readonly height?: number;
    readonly fit?: [number, number];
    readonly cover?: [number, number];
    readonly align?: 'left' | 'center' | 'right';
    readonly valign?: 'top' | 'center' | 'bottom';
  }

  interface PdfEmbeddedFont {
    readonly ascender: number;
    readonly descender: number;
    readonly font: { hasGlyphForCodePoint(codePoint: number): boolean };
  }

  interface PdfDocumentOptions {
    readonly size?: [number, number] | string;
    readonly margins?: { top: number; right: number; bottom: number; left: number };
    readonly font?: Uint8Array | ArrayBuffer;
    readonly bufferPages?: boolean;
    readonly autoFirstPage?: boolean;
    readonly tagged?: boolean;
    readonly lang?: string;
    readonly pdfVersion?: '1.7' | '1.7ext3';
    readonly subset?: 'PDF/UA';
    readonly displayTitle?: boolean;
    readonly compress?: boolean;
    readonly info?: {
      readonly Title?: string;
      readonly Author?: string;
      readonly Subject?: string;
      readonly Creator?: string;
      readonly Producer?: string;
      readonly CreationDate?: Date;
      readonly ModDate?: Date;
    };
  }

  interface PdfPage {
    readonly width: number;
    readonly height: number;
    margins: { top: number; right: number; bottom: number; left: number };
  }

  class PDFDocument {
    constructor(options?: PdfDocumentOptions);
    page: PdfPage;
    readonly _font: PdfEmbeddedFont;
    x: number;
    y: number;
    on(event: 'data', listener: (chunk: Uint8Array) => void): this;
    on(event: 'end', listener: () => void): this;
    on(event: 'pageAdded', listener: () => void): this;
    end(): void;
    addPage(): this;
    switchToPage(index: number): this;
    bufferedPageRange(): { start: number; count: number };
    registerFont(name: string, source: Uint8Array | ArrayBuffer): this;
    font(name: string): this;
    fontSize(size: number): this;
    currentLineHeight(includeGap?: boolean): number;
    widthOfString(text: string, options?: PdfTextOptions): number;
    heightOfString(text: string, options?: PdfTextOptions): number;
    text(text: string, x: number, y: number, options?: PdfTextOptions): this;
    fillColor(color: string, opacity?: number): this;
    strokeColor(color: string, opacity?: number): this;
    fillOpacity(opacity: number): this;
    lineWidth(width: number): this;
    moveTo(x: number, y: number): this;
    lineTo(x: number, y: number): this;
    rect(x: number, y: number, width: number, height: number): this;
    circle(x: number, y: number, radius: number): this;
    path(d: string): this;
    fill(color?: string, rule?: 'nonzero' | 'even-odd'): this;
    stroke(color?: string): this;
    clip(rule?: 'nonzero' | 'even-odd'): this;
    save(): this;
    restore(): this;
    translate(x: number, y: number): this;
    scale(x: number, y?: number): this;
    roundedRect(x: number, y: number, width: number, height: number, radius: number): this;
    image(source: Uint8Array | ArrayBuffer, x: number, y: number, options: PdfImageOptions): this;
    link(
      x: number,
      y: number,
      width: number,
      height: number,
      url: string,
      options?: { structParent?: PdfStructureElement; Contents?: PdfString },
    ): this;
    struct(type: string, options?: PdfStructureOptions, children?: () => void): PdfStructureElement;
    struct(type: string, children: () => void): PdfStructureElement;
    addStructure(element: PdfStructureElement): this;
    markContent(tag: 'Artifact', options?: { type?: 'Pagination' | 'Layout' | 'Page' }): this;
    endMarkedContent(): this;
  }

  export default PDFDocument;
  export type { PdfStructureElement, PdfStructureOptions, PdfDocumentOptions };
}
