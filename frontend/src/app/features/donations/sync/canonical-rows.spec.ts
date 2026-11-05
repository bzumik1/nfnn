import { sharedCases } from '../../../../testing/shared-cases';
import { canonicalRows, rowsSha256 } from './canonical-rows';

async function written(rows: readonly unknown[]): Promise<Readonly<Record<string, string>>> {
  try {
    return { canonical: canonicalRows(rows), rowsSha256: await rowsSha256(rows) };
  } catch (refused) {
    expect(String(refused)).toMatch(/integers within the safe range/);
    return { refusal: 'not-a-safe-integer' };
  }
}

for (const sharedCase of sharedCases('sync/canonical.json')) {
  describe(`Given the shared case ${sharedCase.name}`, () => {
    it("when the browser writes the rows canonically and hashes them as a device will, then it gives the case's canonical JSON and rowsSha256, or refuses the rows", async () => {
      expect(await written(sharedCase.input.rows)).toEqual(sharedCase.expected);
    });
  });
}
