import { NavigationFacts, pageTransitionFor } from './page-transition-kind';

const ARTICLE_FROM_LIST: NavigationFacts = {
  first: false,
  reducedMotion: false,
  compact: true,
  dialogOpen: false,
  trigger: 'imperative',
  back: false,
  replaceUrl: false,
  skipLocationChange: false,
  from: { url: '/aktuality', parent: null },
  to: { url: '/aktuality/clanek', parent: '/aktuality' },
};

const LIST_FROM_ARTICLE: NavigationFacts = {
  ...ARTICLE_FROM_LIST,
  trigger: 'popstate',
  from: { url: '/aktuality/clanek', parent: '/aktuality' },
  to: { url: '/aktuality', parent: null },
};

describe('Given a navigation on a phone', () => {
  it('when a page with a back button opens from the page before it, then the new page slides in over it', () => {
    expect(pageTransitionFor(ARTICLE_FROM_LIST)).toBe('push');
  });

  it('when the site steps back in its own history from a page with a back button, then that page slides away', () => {
    expect(pageTransitionFor(LIST_FROM_ARTICLE)).toBe('pop');
  });

  it('when Zpět opens the parent in place of the page, then that page slides away too', () => {
    expect(
      pageTransitionFor({
        ...LIST_FROM_ARTICLE,
        trigger: 'imperative',
        back: true,
        replaceUrl: true,
      }),
    ).toBe('pop');
  });

  it('when the account opens from a public page, then it slides in, as the account is no tab', () => {
    expect(
      pageTransitionFor({
        ...ARTICLE_FROM_LIST,
        from: { url: '/o-nas', parent: null },
        to: { url: '/darce/prehled', parent: '/' },
      }),
    ).toBe('push');
  });

  it('when a tab opens a deep page it kept, then the tab switches without a slide', () => {
    expect(
      pageTransitionFor({
        ...ARTICLE_FROM_LIST,
        from: { url: '/o-nas', parent: null },
        to: { url: '/aktuality/clanek', parent: '/aktuality' },
      }),
    ).toBeNull();
  });

  it('when the page opened has no back button, then it shows without a slide', () => {
    expect(
      pageTransitionFor({
        ...ARTICLE_FROM_LIST,
        from: { url: '/aktuality/clanek', parent: '/aktuality' },
        to: { url: '/projekty', parent: null },
      }),
    ).toBeNull();
  });

  it('when only the query or the fragment changes, then the page stays without a slide', () => {
    expect(
      pageTransitionFor({
        ...ARTICLE_FROM_LIST,
        from: { url: '/projekty?rok=2025', parent: '/projekty' },
        to: { url: '/projekty?rok=2024', parent: '/projekty' },
      }),
    ).toBeNull();
  });

  it('when a page replaces another without stepping back, then it shows without a slide', () => {
    expect(pageTransitionFor({ ...ARTICLE_FROM_LIST, replaceUrl: true })).toBeNull();
  });

  it('when the step back leaves a page without a back button, then it shows without a slide', () => {
    expect(
      pageTransitionFor({
        ...LIST_FROM_ARTICLE,
        from: { url: '/aktuality', parent: null },
        to: { url: '/o-nas', parent: null },
      }),
    ).toBeNull();
  });

  for (const [name, facts] of [
    ['it is the first page of the visit', { first: true }],
    ['the visitor asks for less motion', { reducedMotion: true }],
    ['the screen is wide', { compact: false }],
    ['a dialog is open', { dialogOpen: true }],
    ['the address does not change', { skipLocationChange: true }],
  ] as const) {
    it(`when ${name}, then pages switch without a slide`, () => {
      expect(pageTransitionFor({ ...ARTICLE_FROM_LIST, ...facts })).toBeNull();
      expect(pageTransitionFor({ ...LIST_FROM_ARTICLE, ...facts })).toBeNull();
    });
  }
});
