import { logoSvg } from '../../../../testing/receipt-assets';
import { RECEIPT_LOGO } from './receipt-logo';

describe('Given the logo of the site and the logo the receipt draws', () => {
  it('when the receipt logo is compared with public/images/logo.svg, then it has its view box and every path with its colour', () => {
    const svg = logoSvg();
    const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1].split(/\s+/).map(Number);
    const paths = Array.from(
      svg.matchAll(/<path[^>]*\sfill="([^"]+)"[^>]*\sd="([^"]+)"/g),
      (match) => ({
        d: match[2],
        fill:
          match[1].length === 4
            ? `#${[...match[1].slice(1)].map((digit) => digit + digit).join('')}`
            : match[1],
        opacity: 1,
      }),
    );

    expect(paths.length).toBeGreaterThan(0);
    expect(RECEIPT_LOGO).toEqual({ viewBox, paths });
  });
});
