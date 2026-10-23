import { QrMatrix } from '../qr-matrix';

export function qrMatrix(size: number, dark: (column: number, row: number) => boolean): QrMatrix {
  let modules = '';
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      modules += dark(column, row) ? '1' : '0';
    }
  }
  return { size, modules };
}

export const checkerboard = (size: number): QrMatrix =>
  qrMatrix(size, (column, row) => (column + row) % 2 === 0);

export const inverseCheckerboard = (size: number): QrMatrix =>
  qrMatrix(size, (column, row) => (column + row) % 2 === 1);
