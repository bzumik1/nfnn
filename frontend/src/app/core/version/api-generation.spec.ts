import exported from './api-generation.json';
import { API_GENERATION, POSTS_ACROSS_GENERATIONS } from './api-generation';

describe('Given the API generation the app is built for', () => {
  it('when the exported JSON the backend reads is compared, then it names the same generation and the same writes that pass across generations', () => {
    expect(exported).toEqual({
      generation: API_GENERATION,
      postsAcrossGenerations: [...POSTS_ACROSS_GENERATIONS],
    });
  });

  it('when it is read, then it is a positive whole number', () => {
    expect(Number.isInteger(API_GENERATION) && API_GENERATION > 0).toBe(true);
  });
});
