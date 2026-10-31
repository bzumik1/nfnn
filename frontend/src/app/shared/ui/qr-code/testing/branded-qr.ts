import { QrErrorCorrection, encodeText } from '../qr-encoder';
import { QrMatrix } from '../qr-matrix';

const QUIET_ZONE = 4;
const DOT_OFFSET = QUIET_ZONE + 0.5;

export function drawsMatrix(svg: Element | null, matrix: QrMatrix): boolean {
  const side = Number(svg?.getAttribute('viewBox')?.split(' ')[2]);
  const dots = Array.from(svg?.querySelectorAll('circle.qr-dot') ?? []);
  return (
    side === matrix.size + 2 * QUIET_ZONE &&
    dots.length > 0 &&
    dots.every((dot) => {
      const column = Number(dot.getAttribute('cx')) - DOT_OFFSET;
      const row = Number(dot.getAttribute('cy')) - DOT_OFFSET;
      const dark = matrix.modules[row * matrix.size + column] === '1';
      return dark !== dot.classList.contains('is-off');
    })
  );
}

export function drawsText(
  svg: Element | null,
  text: string,
  errorCorrection: QrErrorCorrection = 'H',
): boolean {
  return drawsMatrix(svg, encodeText(text, errorCorrection));
}
