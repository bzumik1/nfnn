import { Route } from '@angular/router';
import { adminRoutes } from './admin.routes';
import { ADMIN_DAILY, ADMIN_OCCASIONAL, ADMIN_TECHNICAL } from './shell/admin-sections';

describe('Given the pages of the administration', () => {
  const pages: readonly Route[] = adminRoutes[0].children ?? [];

  function parentOf(path: string): unknown {
    return pages.find((page) => page.path === path)?.data?.['parent'];
  }

  function pathOf(link: string): string {
    return link.replace(/^\/sprava\/?/, '');
  }

  it('when the overview opens, then it names no page of its own to go back to, so the area decides', () => {
    expect(parentOf('')).toBeUndefined();
  });

  it('when a section of every day opens, then the back button leads to the overview, which lists it', () => {
    expect(ADMIN_DAILY.items.map((item) => parentOf(pathOf(item.path)))).toEqual(
      ADMIN_DAILY.items.map(() => '/sprava'),
    );
  });

  it('when a less frequent section opens, then the back button leads to the page that lists it', () => {
    const sections = [...ADMIN_OCCASIONAL.items, ...ADMIN_TECHNICAL.items];
    expect(sections.map((item) => parentOf(pathOf(item.path)))).toEqual(
      sections.map(() => '/sprava/vice'),
    );
    expect(parentOf('vice')).toBe('/sprava');
  });

  it('when a page leads back to the overview or to the further sections, then that page lists it, so a phone reaches it in two taps', () => {
    const backTo = (parent: string): string[] =>
      pages
        .filter((page) => page.path !== 'vice' && page.data?.['parent'] === parent)
        .map((page) => page.path ?? '')
        .sort();
    expect(backTo('/sprava')).toEqual(ADMIN_DAILY.items.map((item) => pathOf(item.path)).sort());
    expect(backTo('/sprava/vice')).toEqual(
      [...ADMIN_OCCASIONAL.items, ...ADMIN_TECHNICAL.items].map((item) => pathOf(item.path)).sort(),
    );
  });

  it('when a donor or an editor opens, then the back button leads to its list', () => {
    expect(
      ['darci/:id', 'aktuality/nova', 'aktuality/:id', 'projekty/nova', 'projekty/:id'].map(
        parentOf,
      ),
    ).toEqual([
      '/sprava/darci',
      '/sprava/aktuality',
      '/sprava/aktuality',
      '/sprava/projekty',
      '/sprava/projekty',
    ]);
  });

  it('when a part of a donor card opens on its own page, then the back button leads to that card', () => {
    expect(parentOf('darci/:id/:section')).toBe('/sprava/darci/:id');
  });

  it('when any other page opens, then it names the page to go back to', () => {
    expect(
      pages.filter((page) => page.path !== '' && parentOf(page.path ?? '') === undefined),
    ).toEqual([]);
  });
});
