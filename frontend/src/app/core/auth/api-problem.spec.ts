import { HttpErrorResponse } from '@angular/common/http';
import { describeProblem } from './api-problem';
import { problem } from './testing/donor-fixtures';

describe('Given a failed API call to describe', () => {
  const generic = 'Spojení se serverem se nepodařilo.';

  function failure(body: unknown, status = 400): HttpErrorResponse {
    return new HttpErrorResponse({ error: body, status, statusText: 'Bad Request' });
  }

  it('when the server sent a problem with a title and a detail, then both are joined into one sentence', () => {
    const description = describeProblem(
      failure(
        problem('donors/password-too-common', 'Heslo je příliš běžné', 'Zvolte prosím jiné heslo.'),
      ),
      generic,
    );

    expect(description).toBe('Heslo je příliš běžné. Zvolte prosím jiné heslo.');
  });

  it('when the problem carries field errors, then their messages follow the title', () => {
    const description = describeProblem(
      failure({
        ...problem('validation', 'Neplatný požadavek'),
        errors: [
          { field: 'password', message: 'Heslo musí mít 12 až 128 znaků.' },
          { field: 'token', message: '' },
        ],
      }),
      generic,
    );

    expect(description).toBe('Neplatný požadavek. Heslo musí mít 12 až 128 znaků.');
  });

  it('when the response has no problem body, then the generic text is shown', () => {
    expect(describeProblem(failure(null, 500), generic)).toBe(generic);
  });

  it('when the problem has no title, then the generic text is shown', () => {
    expect(describeProblem(failure({ type: 'about:blank', title: '' }), generic)).toBe(generic);
  });

  it('when the failure is not an HTTP error at all, then the generic text is shown', () => {
    expect(describeProblem(new Error('offline'), generic)).toBe(generic);
  });
});
