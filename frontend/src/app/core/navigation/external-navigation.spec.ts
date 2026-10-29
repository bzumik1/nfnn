import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';

import { ExternalNavigation } from './external-navigation';

describe('Given a document open at /aktuality?strana=2', () => {
  let assign: ReturnType<typeof vi.fn>;
  let reload: ReturnType<typeof vi.fn>;
  let replaceState: ReturnType<typeof vi.fn>;
  let navigation: ExternalNavigation;

  beforeEach(() => {
    assign = vi.fn();
    reload = vi.fn();
    replaceState = vi.fn();
    const view = {
      location: { href: 'https://nfnn.cz/aktuality?strana=2', assign, reload },
      history: { replaceState },
    };
    TestBed.configureTestingModule({
      providers: [{ provide: DOCUMENT, useValue: { defaultView: view } }],
    });
    navigation = TestBed.inject(ExternalNavigation);
  });

  it('when another page is loaded from the server, then the browser goes there and keeps the current page in its history', () => {
    navigation.loadFromServer('/projekty/zahrada');

    expect(assign).toHaveBeenCalledExactlyOnceWith('/projekty/zahrada');
    expect(reload).not.toHaveBeenCalled();
  });

  it('when the same page with a fragment is loaded from the server, then the address takes the fragment and the document reloads', () => {
    navigation.loadFromServer('/aktuality?strana=2#clanky');

    expect(replaceState).toHaveBeenCalledExactlyOnceWith(null, '', '/aktuality?strana=2#clanky');
    expect(reload).toHaveBeenCalledOnce();
    expect(assign).not.toHaveBeenCalled();
  });

  it('when the same page is loaded from the server, then the document reloads', () => {
    navigation.loadFromServer('/aktuality?strana=2');

    expect(reload).toHaveBeenCalledOnce();
    expect(assign).not.toHaveBeenCalled();
  });

  it('when the same address with another query is loaded from the server, then the browser goes there', () => {
    navigation.loadFromServer('/aktuality?strana=3');

    expect(assign).toHaveBeenCalledExactlyOnceWith('/aktuality?strana=3');
  });
});
