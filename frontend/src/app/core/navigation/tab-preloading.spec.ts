import { Route, Routes } from '@angular/router';
import { firstValueFrom, Observable, of, throwError } from 'rxjs';
import { routes } from '../../app.routes';
import { contentRoutes } from '../../features/content/content.routes';
import { APP_TABS } from './app-tabs';
import { LOADED_AHEAD, TabPagesPreloading } from './tab-preloading';

describe('Given the preloading of the pages behind the tab bar', () => {
  const preloading = new TabPagesPreloading();

  async function preloads(route: Route): Promise<boolean> {
    let loaded = false;
    await firstValueFrom(
      preloading.preload(route, () => {
        loaded = true;
        return of(true);
      }),
    );
    return loaded;
  }

  function loadedAhead(config: Routes): string[] {
    return config.filter((route) => route.data?.['loadedAhead'] === true).map((r) => r.path ?? '');
  }

  it('when a route is marked to load ahead, then it is loaded once the first page has opened', async () => {
    expect(await preloads({ path: 'aktuality', data: LOADED_AHEAD })).toBe(true);
  });

  it('when a route is not marked, then it waits until it is opened, whatever its name', async () => {
    expect(await preloads({ path: 'aktuality' })).toBe(false);
    expect(await preloads({ path: '' })).toBe(false);
  });

  it('when loading ahead fails, then nothing is reported and the page loads when it is opened', async () => {
    const failing = (): Observable<unknown> => throwError(() => new Error('chunk gone'));

    await expect(
      firstValueFrom(preloading.preload({ path: 'aktuality', data: LOADED_AHEAD }, failing)),
    ).resolves.toBeNull();
  });

  it('when the app lists its routes, then exactly the public shell, the content pages and the four tabs load ahead', () => {
    expect(loadedAhead(routes)).toEqual(['']);
    const shell = routes.find((route) => route.data?.['loadedAhead'] === true);
    expect(loadedAhead(shell?.children ?? [])).toEqual(['']);
    expect(loadedAhead(contentRoutes).sort()).toEqual(
      [...APP_TABS.map((tab) => tab.path.slice(1)), 'aktuality/:slug', 'projekty/:slug'].sort(),
    );
  });
});
