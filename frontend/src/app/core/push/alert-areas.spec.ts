import { faultDescription, faultRoute } from './alert-areas';

const AT = '2026-11-14T02:00:05Z';

describe('Given the open faults the badge of the app icon counts', () => {
  it('when one area is broken, then its row leads to that area page', () => {
    expect(faultRoute([{ area: 'bankImport', since: AT }])).toBe('/sprava');
    expect(faultRoute([{ area: 'backups', since: AT }])).toBe('/sprava/zalohy');
    expect(faultRoute([{ area: 'mail', since: AT }])).toBe('/sprava/nastaveni');
  });

  it('when several areas are broken, then the row leads to the alerts page that lists them all', () => {
    expect(
      faultRoute([
        { area: 'backups', since: AT },
        { area: 'mail', since: AT },
      ]),
    ).toBe('/sprava/upozorneni');
  });

  it('when faults are counted for the account button, then the count reads in Czech plurals', () => {
    expect(faultDescription(1)).toBe('1 porucha');
    expect(faultDescription(3)).toBe('3 poruchy');
    expect(faultDescription(5)).toBe('5 poruch');
  });
});
