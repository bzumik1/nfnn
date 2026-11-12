import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';

import { ExternalNavigation } from './external-navigation';

describe('Given a document open at /aktuality?strana=2', () => {
  let assign: ReturnType<typeof vi.fn>;
  let reload: ReturnType<typeof vi.fn>;
  let replaceState: ReturnType<typeof vi.fn>;
  let pushState: ReturnType<typeof vi.fn>;
  let navigation: ExternalNavigation;

  beforeEach(() => {
    assign = vi.fn();
    reload = vi.fn();
    replaceState = vi.fn();
    pushState = vi.fn();
    const view = {
      location: { href: 'https://nfnn.cz/aktuality?strana=2', assign, reload },
      history: { replaceState, pushState },
    };
    TestBed.configureTestingModule({
      providers: [{ provide: DOCUMENT, useValue: { defaultView: view } }],
    });
    navigation = TestBed.inject(ExternalNavigation);
  });

  it('when another page is loaded from the server, then the site’s history takes it as a step and the document loads it, so the browser gains no entry', () => {
    navigation.loadFromServer('/projekty/zahrada');

    expect(pushState).toHaveBeenCalledExactlyOnceWith(null, '', '/projekty/zahrada');
    expect(reload).toHaveBeenCalledOnce();
    expect(assign).not.toHaveBeenCalled();
  });

  it('when the same page with a fragment is loaded from the server, then the address takes the fragment and the document reloads', () => {
    navigation.loadFromServer('/aktuality?strana=2#clanky');

    expect(replaceState).toHaveBeenCalledExactlyOnceWith(null, '', '/aktuality?strana=2#clanky');
    expect(reload).toHaveBeenCalledOnce();
    expect(pushState).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  it('when the same page is loaded from the server, then the document reloads', () => {
    navigation.loadFromServer('/aktuality?strana=2');

    expect(reload).toHaveBeenCalledOnce();
    expect(assign).not.toHaveBeenCalled();
  });

  it('when the same address with another query is loaded from the server, then the site’s history takes it as a step and the document loads it', () => {
    navigation.loadFromServer('/aktuality?strana=3');

    expect(pushState).toHaveBeenCalledExactlyOnceWith(null, '', '/aktuality?strana=3');
    expect(reload).toHaveBeenCalledOnce();
    expect(assign).not.toHaveBeenCalled();
  });
});
