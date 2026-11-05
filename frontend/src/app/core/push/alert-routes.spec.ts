import { sharedCases } from '../../../testing/shared-cases';
import { openAlertCountOf, routeOfAlert } from './alert-routes';

for (const sharedCase of sharedCases('push/notification.json')) {
  describe(`Given the shared case ${sharedCase.name}`, () => {
    it('when its notification is clicked in the open app, then the app opens the route the server names', () => {
      expect(routeOfAlert({ kind: sharedCase.input.kind, count: 1 })).toBe(sharedCase.expected.url);
    });
  });
}

describe('Given the routes of the push alerts', () => {
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
    [{ count: 999 }, 999],
    [{ count: 1000 }, null],
    [null, null],
    ['3', null],
  ])('when a message %j arrives, then its open alert count reads %s', (message, count) => {
    expect(openAlertCountOf(message)).toBe(count);
  });
});
