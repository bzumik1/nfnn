import { APP_REVISION, revisionOf } from './app-revision';

describe('Given the revision a build bakes into the app', () => {
  it.each(['1a2b3c4', '0123456789abcdef0123456789abcdef01234567', 'dev'])(
    'when it is %s, then the reports carry it as it is',
    (revision) => {
      expect(revisionOf(revision)).toBe(revision);
    },
  );

  it.each([
    ['six digits', '1a2b3c'],
    ['41 digits', '0123456789abcdef0123456789abcdef012345678'],
    ['capitals', '1A2B3C4'],
    ['a quote and code', "1a2b3c4'+globalThis.x+'"],
    ['a line break', '1a2b3c4\nWARN'],
    ['nothing', ''],
    ['no value at all', undefined],
    ['a number', 1234567],
  ])('when it is %s, then the reports carry dev, which the server accepts', (_, revision) => {
    expect(revisionOf(revision)).toBe('dev');
  });

  it('when the tests run without a defined revision, then the app reports dev', () => {
    expect(APP_REVISION).toBe('dev');
  });
});
