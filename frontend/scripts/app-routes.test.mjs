import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { APP_ROUTES_FILE, appRouteMatcher, appRoutePatterns } from './app-routes.mjs';

const nginxConf = readFileSync(APP_ROUTES_FILE, 'utf8');

describe('Given the routes nginx answers with the app', () => {
  it('when the list is read, then each line names one route with its parameters', () => {
    const patterns = appRoutePatterns(nginxConf);

    assert.ok(patterns.includes('/'));
    assert.ok(patterns.includes('/o-nas'));
    assert.ok(patterns.includes('/aktuality/:param'));
    assert.ok(patterns.includes('/sprava/darci/:param'));
    assert.ok(patterns.includes('/donor/prehled'));
    assert.deepEqual(patterns, [...patterns].sort());
  });

  it('when addresses of the app are asked, then each one is an app route', () => {
    const isAppRoute = appRouteMatcher(nginxConf);

    for (const path of [
      '/',
      '/o-nas',
      '/prispet',
      '/aktuality/nejaka-zprava',
      '/projekty/novy-projekt',
      '/darce',
      '/darce/prehled',
      '/donor/dary',
      '/sprava',
      '/sprava/darci/0193a2b4-1c2d',
      '/sprava/darci/0193a2b4-1c2d/dary',
      '/sprava/aktuality/nova',
      '/aplikace',
      '/overit',
      '/obnova-hesla',
    ]) {
      assert.ok(isAppRoute(path), `${path} is an app route`);
    }
  });

  it('when addresses the app does not know are asked, then none is an app route', () => {
    const isAppRoute = appRouteMatcher(nginxConf);

    for (const path of [
      '/neexistuje',
      '/o-nass',
      '/O-nas',
      '/o-nas/',
      '/o-nas/kontakt',
      '/darce/neco',
      '/sprava/neco',
      '/aktuality/a/b',
      '/sprava/darci/a/b/c',
      '/aplikace/x',
      '/images',
      '/index',
    ]) {
      assert.ok(!isAppRoute(path), `${path} is not an app route`);
    }
  });

  it('when a line holds more than one literal route, then reading the list refuses it', () => {
    const widened = nginxConf.replace('"~^/o-nas$"', '"~^/o-n.s$"');

    assert.throws(() => appRoutePatterns(widened), /~\^\/o-n\.s\$/);
  });

  it('when nginx.conf has no list of app routes, then reading it refuses', () => {
    const without = nginxConf.replace('map $uri $app_page {', 'map $uri $other {');

    assert.throws(() => appRoutePatterns(without), /map \$uri \$app_page/);
  });
});
