export function canonicalRows(rows: readonly unknown[]): string {
  return JSON.stringify(rows);
}

export async function rowsSha256(rows: readonly unknown[]): Promise<string> {
  return Promise.resolve(canonicalRows(rows));
}
