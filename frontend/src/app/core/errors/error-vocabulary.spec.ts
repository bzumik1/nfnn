import exported from './error-vocabulary.json';
import { ERROR_VOCABULARY } from './error-vocabulary';

describe('Given the closed vocabulary of browser error reports', () => {
  it('when the exported JSON the backend reads is compared, then it lists exactly the values of the code in their order (npm run errors:vocabulary writes it)', () => {
    expect(exported).toEqual(ERROR_VOCABULARY);
  });

  it('when every value is checked, then none can carry a space, a line break or a digit with a dash', () => {
    for (const value of Object.values(ERROR_VOCABULARY).flat()) {
      expect(value).toMatch(/^[A-Za-z][A-Za-z-]*$/);
    }
  });
});
