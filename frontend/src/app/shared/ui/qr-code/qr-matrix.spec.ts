import { alignmentCentres, darkModules } from './qr-matrix';
import { checkerboard } from './testing/qr-matrices';

describe('Given QR code sizes of known versions', () => {
  it('when the alignment centres are worked out, then they match the QR code standard', () => {
    expect(alignmentCentres(21)).toEqual([]);
    expect(alignmentCentres(25)).toEqual([6, 18]);
    expect(alignmentCentres(49)).toEqual([6, 24, 42]);
    expect(alignmentCentres(53)).toEqual([6, 26, 46]);
    expect(alignmentCentres(145)).toEqual([6, 34, 60, 86, 112, 138]);
    expect(alignmentCentres(177)).toEqual([6, 30, 58, 86, 114, 142, 170]);
  });
});

describe('Given a checkerboard of 21 modules', () => {
  it('when its dark modules are counted, then every other module is dark', () => {
    expect(darkModules(checkerboard(21))).toBe(221);
  });
});
