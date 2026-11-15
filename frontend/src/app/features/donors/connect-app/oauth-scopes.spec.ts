import { knownScopes } from './oauth-scopes';

describe('Given the scopes an application asks for', () => {
  it('when the scope names a property every object inherits, then it is unknown', () => {
    expect(knownScopes('toString constructor __proto__ hasOwnProperty')).toEqual([]);
  });

  it('when the scopes are the two the site offers, then both are known', () => {
    expect(knownScopes('admin:read admin:write')).toEqual(['admin:read', 'admin:write']);
  });
});
