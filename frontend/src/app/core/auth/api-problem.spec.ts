import { HttpErrorResponse } from '@angular/common/http';
import { describeProblem, describeProblemWithoutFields, problemOf } from './api-problem';
import { problem, SAMPLE_CHALLENGE, secondFactorRequired } from './testing/donor-fixtures';

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

  it('when the field errors already stand at their fields, then only the title and the detail are joined', () => {
    const description = describeProblemWithoutFields(
      failure({
        ...problem('validation', 'Neplatný požadavek', 'Zkontrolujte prosím údaje.'),
        errors: [{ field: 'password', message: 'Heslo musí mít 12 až 128 znaků.' }],
      }),
      generic,
    );

    expect(description).toBe('Neplatný požadavek. Zkontrolujte prosím údaje.');
    expect(describeProblemWithoutFields(failure(null, 500), generic)).toBe(generic);
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

  it('when the problem carries a second-factor challenge, then it is read, and it is null otherwise', () => {
    expect(problemOf(failure(secondFactorRequired(), 401))?.challenge).toBe(SAMPLE_CHALLENGE);
    expect(problemOf(failure(problem('auth/invalid-credentials'), 401))?.challenge).toBeNull();
  });
});
