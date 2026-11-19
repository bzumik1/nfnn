import {
  NavigationFacts,
  PageFadeFacts,
  pageFadeFor,
  pageTransitionFor,
  pushWithinSection,
} from './page-transition-kind';

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

const ABOUT_TO_NEWS: PageFadeFacts = {
  first: false,
  reducedMotion: false,
  compact: false,
  dialogOpen: false,
  trigger: 'imperative',
  back: false,
  skipLocationChange: false,
  insideLockedAdministration: false,
  from: '/o-nas',
  to: '/aktuality',
};

describe('Given a navigation on a computer', () => {
  it('when another page opens from a link, then the content fades through to it', () => {
    expect(pageFadeFor(ABOUT_TO_NEWS)).toBe(true);
  });

  it('when the account opens from a public page, then the content fades through to it too', () => {
    expect(pageFadeFor({ ...ABOUT_TO_NEWS, to: '/darce/prehled' })).toBe(true);
  });

  it('when only the query or the fragment changes, then the page stays without a fade', () => {
    expect(
      pageFadeFor({ ...ABOUT_TO_NEWS, from: '/sprava/platby?q=1', to: '/sprava/platby?q=2' }),
    ).toBe(false);
    expect(
      pageFadeFor({
        ...ABOUT_TO_NEWS,
        from: '/zasady-ochrany-osobnich-udaju',
        to: '/zasady-ochrany-osobnich-udaju#udaje',
      }),
    ).toBe(false);
  });

  for (const [name, facts] of [
    ['it is the first page of the visit', { first: true }],
    ['the visitor asks for less motion', { reducedMotion: true }],
    ['the screen is a phone', { compact: true }],
    ['a dialog is open', { dialogOpen: true }],
    ['the browser steps back or forward', { trigger: 'popstate' }],
    ['the browser changes the fragment', { trigger: 'hashchange' }],
    ['Zpět opens the page above without a step to go back to', { back: true }],
    ['the locked administration opens another of its pages', { insideLockedAdministration: true }],
    ['the address does not change', { skipLocationChange: true }],
  ] as const) {
    it(`when ${name}, then pages switch at once`, () => {
      expect(pageFadeFor({ ...ABOUT_TO_NEWS, ...facts })).toBe(false);
    });
  }
});

describe('Given a wide screen whose header and side navigation name the sections', () => {
  const SECTIONS = ['/', '/aktuality', '/projekty', '/sprava', '/sprava/platby', '/sprava/darci'];

  it('when an article of the news is open, then stepping back to the news is a push within the section', () => {
    expect(pushWithinSection('/aktuality/clanek', '/aktuality', SECTIONS)).toBe(true);
  });

  it('when a donor card is open, then stepping back to the donors is a push within the section', () => {
    expect(pushWithinSection('/sprava/darci/42', '/sprava/darci', SECTIONS)).toBe(true);
  });

  it('when a page deeper within the donor card is open, then stepping back to the card is a push within the section', () => {
    expect(pushWithinSection('/sprava/darci/42/potvrzeni', '/sprava/darci/42', SECTIONS)).toBe(
      true,
    );
  });

  it('when a section of the side navigation is open, then going to the overview is no step, as the side navigation switches sections', () => {
    expect(pushWithinSection('/sprava/platby', '/sprava', SECTIONS)).toBe(false);
  });

  it('when the page belongs to no section of the navigation, then going to its parent is no push', () => {
    expect(pushWithinSection('/overit', '/', SECTIONS)).toBe(false);
  });

  it('when the page has no parent, then there is nothing to step back to', () => {
    expect(pushWithinSection('/aktuality', null, SECTIONS)).toBe(false);
  });

  it('when the parent lies in another section, then going there is no push', () => {
    expect(pushWithinSection('/aktuality/clanek', '/projekty', SECTIONS)).toBe(false);
  });
});
