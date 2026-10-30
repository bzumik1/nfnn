import jsQR, { QRCode } from 'jsqr';

const QUIET_ZONE = 4;
const PIXELS_PER_MODULE = 4;
const DARK_SQUARE = /M(\d+) (\d+)h1v1h-1z/g;

export function drawnRows(svg: SVGSVGElement): string[] {
  const size = Number(svg.getAttribute('viewBox')?.split(' ')[2]) - 2 * QUIET_ZONE;
  const rows = Array.from({ length: size }, () => Array.from({ length: size }, () => '0'));
  for (const [x, y] of darkSquares(svg)) {
    rows[y - QUIET_ZONE][x - QUIET_ZONE] = '1';
  }
  return rows.map((row) => row.join(''));
}

export function decodePlainQr(svg: SVGSVGElement): QRCode | null {
  const width = Number(svg.getAttribute('viewBox')?.split(' ')[2]) * PIXELS_PER_MODULE;
  const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
  for (const [x, y] of darkSquares(svg)) {
    for (let row = y * PIXELS_PER_MODULE; row < (y + 1) * PIXELS_PER_MODULE; row++) {
      const start = (row * width + x * PIXELS_PER_MODULE) * 4;
      for (let pixel = start; pixel < start + PIXELS_PER_MODULE * 4; pixel += 4) {
        pixels.fill(0, pixel, pixel + 3);
      }
    }
  }
  return jsQR(pixels, width, width, { inversionAttempts: 'dontInvert' });
}

function darkSquares(svg: SVGSVGElement): [number, number][] {
  const path = svg.querySelector('.qr-plain')?.getAttribute('d') ?? '';
  return Array.from(path.matchAll(DARK_SQUARE), ([, x, y]) => [Number(x), Number(y)]);
}
