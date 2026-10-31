import jsQR from 'jsqr';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';

(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = pdfjsWorker;

export interface ReadLink {
  readonly url: string;
  readonly rect: readonly [number, number, number, number];
}

export interface ReadPage {
  readonly number: number;
  readonly widthPt: number;
  readonly heightPt: number;
  readonly text: string;
  readonly artifacts: string;
  readonly links: readonly ReadLink[];
}

export interface StructNode {
  readonly role: string;
  readonly alt?: string;
  readonly lang?: string;
  readonly children?: readonly (StructNode | { readonly type: string })[];
}

export interface ReadPdf {
  readonly pages: readonly ReadPage[];
  readonly roles: readonly string[];
  readonly figureAlts: readonly string[];
  readonly raw: string;
}

export interface Raster {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

interface TextPiece {
  readonly str?: string;
  readonly hasEOL?: boolean;
  readonly type?: string;
  readonly tag?: string;
}

interface CanvasLike {
  getContext(kind: '2d'): CanvasRenderingContext2D;
}

const HYPHEN_AFTER_LETTER = /\p{L}-$/u;

export function normalised(text: string): string {
  return text.replace(/[ \s]+/g, ' ').trim();
}

export function latin1(bytes: Uint8Array): string {
  let text = '';
  for (let start = 0; start < bytes.length; start += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return text;
}

interface OpenPdf {
  readonly pdf: pdfjs.PDFDocumentProxy;
  close(): Promise<void>;
}

async function open(bytes: Uint8Array): Promise<OpenPdf> {
  const task = pdfjs.getDocument({ data: bytes.slice() });
  const pdf = await task.promise;
  return { pdf, close: () => task.destroy() };
}

function roles(node: StructNode, into: StructNode[]): StructNode[] {
  into.push(node);
  for (const child of node.children ?? []) {
    if ('role' in child) {
      roles(child, into);
    }
  }
  return into;
}

export async function readPdf(bytes: Uint8Array): Promise<ReadPdf> {
  const { pdf, close } = await open(bytes);
  const pages: ReadPage[] = [];
  const structure: StructNode[] = [];
  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number);
    const content = await page.getTextContent({ includeMarkedContent: true });
    let artifactDepth = 0;
    let depth = 0;
    const text: string[] = [];
    const artifacts: string[] = [];
    const into = () => (artifactDepth > 0 ? artifacts : text);
    for (const item of content.items as TextPiece[]) {
      if (item.type === 'beginMarkedContent' || item.type === 'beginMarkedContentProps') {
        into().push(' ');
        depth++;
        if (item.tag === 'Artifact' && artifactDepth === 0) {
          artifactDepth = depth;
        }
      } else if (item.type === 'endMarkedContent') {
        into().push(' ');
        if (depth === artifactDepth) {
          artifactDepth = 0;
        }
        depth--;
      } else if (item.str !== undefined) {
        const brokenWord = HYPHEN_AFTER_LETTER.test(item.str);
        into().push(item.str, item.hasEOL && !brokenWord ? ' ' : '');
      }
    }
    const annotations = (await page.getAnnotations()) as {
      subtype: string;
      url?: string;
      rect: [number, number, number, number];
    }[];
    const tree = (await page.getStructTree()) as StructNode | null;
    if (tree !== null) {
      roles(tree, structure);
    }
    const [, , widthPt, heightPt] = page.view;
    pages.push({
      number,
      widthPt,
      heightPt,
      text: normalised(text.join('')),
      artifacts: normalised(artifacts.join('')),
      links: annotations
        .filter((annotation) => annotation.subtype === 'Link')
        .map((annotation) => ({ url: annotation.url ?? '', rect: annotation.rect })),
    });
  }
  await close();
  return {
    pages,
    roles: [...new Set(structure.map((node) => node.role))],
    figureAlts: structure.filter((node) => node.role === 'Figure').map((node) => node.alt ?? ''),
    raw: latin1(bytes),
  };
}

export async function rasterPage(bytes: Uint8Array, number: number, dpi: number): Promise<Raster> {
  const { pdf, close } = await open(bytes);
  const page = await pdf.getPage(number);
  const viewport = page.getViewport({ scale: dpi / 72 });
  const factory = (
    pdf as unknown as {
      canvasFactory: { create(width: number, height: number): { canvas: CanvasLike } };
    }
  ).canvasFactory;
  const width = Math.ceil(viewport.width);
  const height = Math.ceil(viewport.height);
  const { canvas } = factory.create(width, height);
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  await page.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise;
  const image = context.getImageData(0, 0, width, height);
  await close();
  return { width, height, data: new Uint8ClampedArray(image.data) };
}

export function blurred(raster: Raster, radius: number): Raster {
  const { width, height } = raster;
  const pass = (source: Uint8ClampedArray, horizontal: boolean): Uint8ClampedArray => {
    const target = new Uint8ClampedArray(source.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        for (let channel = 0; channel < 3; channel++) {
          let sum = 0;
          let count = 0;
          for (let offset = -radius; offset <= radius; offset++) {
            const sx = horizontal ? x + offset : x;
            const sy = horizontal ? y : y + offset;
            if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
              sum += source[(sy * width + sx) * 4 + channel];
              count++;
            }
          }
          target[(y * width + x) * 4 + channel] = sum / count;
        }
        target[(y * width + x) * 4 + 3] = 255;
      }
    }
    return target;
  };
  return { width, height, data: pass(pass(raster.data, true), false) };
}

export function noisy(raster: Raster, amplitude: number, seed: number): Raster {
  let state = seed >>> 0;
  const next = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const data = new Uint8ClampedArray(raster.data);
  for (let pixel = 0; pixel < data.length; pixel += 4) {
    const shift = (next() + next() + next() - 1.5) * amplitude;
    data[pixel] += shift;
    data[pixel + 1] += shift;
    data[pixel + 2] += shift;
  }
  return { ...raster, data };
}

export function cropped(raster: Raster, x: number, y: number, width: number, height: number): Raster {
  const left = Math.max(0, Math.floor(x));
  const top = Math.max(0, Math.floor(y));
  const right = Math.min(raster.width, Math.ceil(x + width));
  const bottom = Math.min(raster.height, Math.ceil(y + height));
  const data = new Uint8ClampedArray((right - left) * (bottom - top) * 4);
  for (let row = top; row < bottom; row++) {
    data.set(
      raster.data.subarray((row * raster.width + left) * 4, (row * raster.width + right) * 4),
      (row - top) * (right - left) * 4,
    );
  }
  return { width: right - left, height: bottom - top, data };
}

export function decodedQr(raster: Raster): string | null {
  return jsQR(raster.data, raster.width, raster.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
}
