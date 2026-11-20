import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { ExternalNavigation } from '../navigation/external-navigation';
import { DirtyForms } from '../updates/dirty-forms';
import { RunningWork } from '../updates/running-work';
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

  it('when a form on the page holds unsaved input, then the page does not load again and keeps what was typed', async () => {
    const reload = await startAt('/darce/udaje');
    TestBed.inject(DirtyForms).register(() => true);

    expect(reload.reloadFocusing('notifications-title')).toBe(false);
    expect(loadFromServer).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(RELOAD_PLACE_KEY)).toBeNull();
  });

  it('when a write is still on its way, then the page does not load again and lets it finish', async () => {
    const reload = await startAt('/darce/udaje');
    TestBed.inject(RunningWork).start();

    expect(reload.reloadFocusing('notifications-title')).toBe(false);
    expect(loadFromServer).not.toHaveBeenCalled();
  });

  it('when a form or a write held the reload back, then the next request once both are done still loads the page', async () => {
    const reload = await startAt('/darce/udaje');
    const end = TestBed.inject(RunningWork).start();
    reload.reloadFocusing('notifications-title');
    end();

    expect(reload.reloadFocusing('notifications-title')).toBe(true);
    expect(loadFromServer).toHaveBeenCalledOnce();
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
