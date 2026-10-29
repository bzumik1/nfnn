import { TestBed } from '@angular/core/testing';

import { Connectivity } from './connectivity';

describe('Given the connectivity of the browser', () => {
  afterEach(() => vi.restoreAllMocks());

  it('when the browser says it is offline, then the app is offline', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    expect(TestBed.inject(Connectivity).isOffline()).toBe(true);
  });

  it('when the browser says it is online, then the app is not offline', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);

    expect(TestBed.inject(Connectivity).isOffline()).toBe(false);
  });
});
