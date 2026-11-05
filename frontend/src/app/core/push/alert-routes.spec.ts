import { openAlertCountOf, routeOfAlert } from './alert-routes';

describe('Given the routes of the push alerts', () => {
  it.each([
    ['test', '/sprava/upozorneni'],
    ['bank-import-outage', '/sprava'],
    ['bank-import-recovered', '/sprava'],
    ['backups-outage', '/sprava/zalohy'],
    ['backups-recovered', '/sprava/zalohy'],
    ['mail-outage', '/sprava/nastaveni'],
    ['mail-recovered', '/sprava/nastaveni'],
  ])('when a notification of kind %s is clicked, then the app opens %s', (kind, route) => {
    expect(routeOfAlert({ kind, count: 1 })).toBe(route);
  });

  it.each([
    ['an unknown kind', { kind: 'https://elsewhere.example/' }],
    ['a kind inherited from Object', { kind: 'constructor' }],
    ['no kind', {}],
    ['no data', undefined],
    ['a text', 'test'],
  ])('when a notification with %s is clicked, then the app opens the alerts page', (_, data) => {
    expect(routeOfAlert(data)).toBe('/sprava/upozorneni');
  });

  it.each([
    [{ count: 0 }, 0],
    [{ count: 3 }, 3],
    [{ count: -1 }, null],
    [{ count: 1.5 }, null],
    [{ count: '2' }, null],
    [{ count: 100 }, null],
    [null, null],
    ['3', null],
  ])('when a message %j arrives, then its open alert count reads %s', (message, count) => {
    expect(openAlertCountOf(message)).toBe(count);
  });
});
