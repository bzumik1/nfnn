import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { ExternalNavigation } from '../navigation/external-navigation';
import { PageReload } from './page-reload';
import { RELOAD_PLACE_KEY } from './reload-place';

@Component({ template: '' })
class Page {}

const START = Date.UTC(2026, 10, 17, 9, 0, 0);

describe('Given a page that offers to load itself again', () => {
  let loadFromServer: ReturnType<typeof vi.fn>;

  async function startAt(url: string): Promise<PageReload> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', component: Page }]),
        { provide: ExternalNavigation, useValue: { loadFromServer } },
      ],
    });
    await TestBed.inject(Router).navigateByUrl(url);
    return TestBed.inject(PageReload);
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(START);
    loadFromServer = vi.fn();
    history.replaceState(null, '', '/darce/udaje');
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.useRealTimers();
  });

  it('when the visitor asks for it, then the page loads again from the server and keeps the heading to focus after it', async () => {
    const reload = await startAt('/darce/udaje');

    expect(reload.reloadFocusing('notifications-title')).toBe(true);

    expect(loadFromServer).toHaveBeenCalledWith('/darce/udaje');
    expect(JSON.parse(sessionStorage.getItem(RELOAD_PLACE_KEY) ?? 'null')).toMatchObject({
      address: '/darce/udaje',
      focus: 'notifications-title',
    });
  });

  it('when the visitor asks again within a minute, then the page does not load again', async () => {
    const reload = await startAt('/darce/udaje');
    reload.reloadFocusing('notifications-title');
    loadFromServer.mockClear();

    vi.setSystemTime(START + 59_000);

    expect(reload.reloadFocusing('notifications-title')).toBe(false);
    expect(loadFromServer).not.toHaveBeenCalled();
  });

  it('when the visitor asks again after a minute, then the page loads once more', async () => {
    const reload = await startAt('/darce/udaje');
    reload.reloadFocusing('notifications-title');
    loadFromServer.mockClear();

    vi.setSystemTime(START + 60_000);

    expect(reload.reloadFocusing('notifications-title')).toBe(true);
    expect(loadFromServer).toHaveBeenCalledTimes(1);
  });
});
