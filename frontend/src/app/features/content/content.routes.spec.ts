import { RouteChromeData } from '../../core/navigation/route-chrome';
import { contentRoutes } from './content.routes';

function headOf(path: string): RouteChromeData['head'] {
  const route = contentRoutes.find((candidate) => candidate.path === path);
  return (route?.data as RouteChromeData | undefined)?.head;
}

describe('Given the public pages', () => {
  it('when a tab or any page under it opens, then the header is the one for the page ground, as on every tab', () => {
    for (const path of [
      'o-nas',
      'aktuality',
      'projekty',
      'prispet',
      'aktuality/:slug',
      'projekty/:slug',
      'zasady-ochrany-osobnich-udaju',
      '**',
    ]) {
      expect(headOf(path), path).toBe('light');
    }
  });

  it('when the landing page opens, then the header stays the one for its photo', () => {
    expect(headOf('')).toBe('photo');
  });
});
