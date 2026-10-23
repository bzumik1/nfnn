import { pluralCategory } from './plural-category';

describe('Given a count in Czech copy', () => {
  it('when it is one, then the form is one', () => {
    expect(pluralCategory(1)).toBe('one');
  });

  it('when it is two to four, then the form is few', () => {
    expect([2, 3, 4].map(pluralCategory)).toEqual(['few', 'few', 'few']);
  });

  it('when it is zero, five or more, then the form is other', () => {
    expect([0, 5, 11, 22, 101].map(pluralCategory)).toEqual([
      'other',
      'other',
      'other',
      'other',
      'other',
    ]);
  });
});
