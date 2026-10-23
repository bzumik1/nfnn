export interface QrMatrix {
  size: number;
  modules: string;
}

export function isDark(matrix: QrMatrix, column: number, row: number): boolean {
  return matrix.modules.charAt(row * matrix.size + column) === '1';
}

export function darkModules(matrix: QrMatrix): number {
  let count = 0;
  for (const module of matrix.modules) {
    if (module === '1') {
      count++;
    }
  }
  return count;
}

export function alignmentCentres(size: number): number[] {
  const version = (size - 17) / 4;
  if (version < 2) {
    return [];
  }
  const count = Math.floor(version / 7) + 2;
  const step =
    version === 32 ? 26 : Math.floor((version * 4 + count * 2 + 1) / (count * 2 - 2)) * 2;
  const centres = [6];
  for (let position = size - 7, index = count - 1; index >= 1; index--, position -= step) {
    centres[index] = position;
  }
  return centres;
}
