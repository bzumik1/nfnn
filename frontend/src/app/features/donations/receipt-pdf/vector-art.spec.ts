import { parseVectorArt } from './vector-art';
import { SYNTHETIC_SIGNATURE_JSON } from './testing/synthetic-art';

describe('Given the canonical JSON of a vector signature', () => {
  it('when it is read, then the view box and every path come back as the server stored them', () => {
    const art = parseVectorArt(SYNTHETIC_SIGNATURE_JSON);

    expect(art.viewBox).toEqual([0, 0, 240, 80]);
    expect(art.paths.length).toBeGreaterThan(0);
    expect(art.paths[0]).toEqual({
      d: expect.stringMatching(/^M/),
      fill: expect.stringMatching(/^#[0-9a-f]{6}$/),
      opacity: expect.any(Number),
    });
  });

  it('when it is the shape of the 1.14 shared case with an arc and implicit line-tos, then it is read', () => {
    expect(
      parseVectorArt(
        '{"viewBox":[0,0,120,60],"paths":[{"d":"M10 10 30 10 30 30 H20 V25 A5 5 0 0 1 30 25 Z","fill":"#aabbcc","opacity":0.25}]}',
      ).paths,
    ).toHaveLength(1);
  });
});

describe('Given JSON that is no canonical vector signature', () => {
  const refused: Record<string, string> = {
    'not JSON': 'svg',
    'an array': '[]',
    'no view box': '{"paths":[]}',
    'a view box of three numbers': '{"viewBox":[0,0,1],"paths":[]}',
    'a view box without width':
      '{"viewBox":[0,0,0,10],"paths":[{"d":"M0 0","fill":"#000000","opacity":1}]}',
    'no paths': '{"viewBox":[0,0,1,1],"paths":[]}',
    'a path with a command outside the canonical set':
      '{"viewBox":[0,0,1,1],"paths":[{"d":"M0 0 url(x)","fill":"#000000","opacity":1}]}',
    'a short colour': '{"viewBox":[0,0,1,1],"paths":[{"d":"M0 0","fill":"#000","opacity":1}]}',
    'a named colour': '{"viewBox":[0,0,1,1],"paths":[{"d":"M0 0","fill":"red","opacity":1}]}',
    'an opacity above one':
      '{"viewBox":[0,0,1,1],"paths":[{"d":"M0 0","fill":"#000000","opacity":2}]}',
    'a field of its own':
      '{"viewBox":[0,0,1,1],"paths":[{"d":"M0 0","fill":"#000000","opacity":1,"href":"x"}]}',
    'a field of its own at the top':
      '{"viewBox":[0,0,1,1],"paths":[{"d":"M0 0","fill":"#000000","opacity":1}],"script":"x"}',
  };

  for (const [name, json] of Object.entries(refused)) {
    it(`when it has ${name}, then it is refused`, () => {
      expect(() => parseVectorArt(json)).toThrow();
    });
  }

  it('when it holds more paths than a signature ever needs, then it is refused', () => {
    const path = '{"d":"M0 0 L1 1","fill":"#000000","opacity":1}';
    expect(() =>
      parseVectorArt(`{"viewBox":[0,0,1,1],"paths":[${Array(2001).fill(path).join(',')}]}`),
    ).toThrow();
  });
});
