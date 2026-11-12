import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { heldRecordRetryInterceptor } from './held-record-retry';
import { ifMatch } from './row-version';

const URL = '/api/admin/content/news/7';
const HELD = { id: '7', title: 'Léto', perex: 'Krátce', version: '0000000000000001' };

function changedMeanwhile(version: string, current: unknown) {
  return {
    type: 'https://nfnn.cz/problems/content/changed-meanwhile',
    title: 'Mezitím se to změnilo',
    status: 409,
    version,
    current,
  };
}

describe('Given a versioned write that carries the record the page held', () => {
  let client: HttpClient;
  let http: HttpTestingController;
  let answer: unknown;
  let failure: unknown;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([heldRecordRetryInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
    answer = undefined;
    failure = undefined;
  });

  afterEach(() => http.verify());

  function write(held?: object): void {
    client.put(URL, { title: 'Léto' }, ifMatch('0000000000000001', held)).subscribe({
      next: (value) => (answer = value),
      error: (refusal: unknown) => (failure = refusal),
    });
  }

  function refuse(version: string, current: unknown): void {
    http
      .expectOne(URL)
      .flush(changedMeanwhile(version, current), { status: 409, statusText: 'Conflict' });
  }

  it('when the server refuses it although the stored record holds the same values, then the write goes once more with the refusal version and its answer comes back', () => {
    write(HELD);
    refuse('00000000000000ff', {
      id: '7',
      title: 'Léto',
      perex: 'Krátce',
      updatedAt: '2026-11-05T15:20:00Z',
    });

    const again = http.expectOne(URL);
    expect(again.request.headers.get('If-Match')).toBe('"00000000000000ff"');
    expect(again.request.body).toEqual({ title: 'Léto' });
    again.flush({ id: '7', version: '0000000000000100' });

    expect(answer).toEqual({ id: '7', version: '0000000000000100' });
    expect(failure).toBeUndefined();
  });

  it('when nested values are equal in another key order, then they count as the same', () => {
    write({ payment: { id: 'p', amount: 100, paired: null }, donation: null });
    refuse('00000000000000ff', { donation: null, payment: { paired: null, amount: 100, id: 'p' } });

    http.expectOne(URL).flush({});

    expect(failure).toBeUndefined();
  });

  it('when a value both hold differs, then the refusal passes through unchanged', () => {
    write(HELD);
    refuse('00000000000000ff', { id: '7', title: 'Podzim', perex: 'Krátce' });

    expect(failure).toBeInstanceOf(HttpErrorResponse);
    expect((failure as HttpErrorResponse).status).toBe(409);
    expect(answer).toBeUndefined();
  });

  it('when the stored record shares no key with the held one but the version, then the refusal passes through', () => {
    write({ version: '0000000000000001', name: 'x' });
    refuse('00000000000000ff', { title: 'Léto' });

    expect((failure as HttpErrorResponse).status).toBe(409);
  });

  it('when the second try is refused too, then that refusal passes through and nothing goes a third time', () => {
    write(HELD);
    refuse('00000000000000ff', { title: 'Léto' });
    refuse('0000000000000aaa', { title: 'Léto' });

    expect((failure as HttpErrorResponse).status).toBe(409);
    expect((failure as HttpErrorResponse).error).toEqual(
      changedMeanwhile('0000000000000aaa', { title: 'Léto' }),
    );
  });

  it('when the write carries no held record, then the refusal passes through', () => {
    write();
    refuse('00000000000000ff', { title: 'Léto' });

    expect((failure as HttpErrorResponse).status).toBe(409);
  });

  it('when the refusal names no version or no stored record, then it passes through', () => {
    write(HELD);
    refuse('', { title: 'Léto' });
    expect((failure as HttpErrorResponse).status).toBe(409);

    write(HELD);
    refuse('00000000000000ff', null);
    expect((failure as HttpErrorResponse).status).toBe(409);
  });

  it('when the answer is another failure or a success, then it is untouched', () => {
    write(HELD);
    http
      .expectOne(URL)
      .flush(
        { type: 'https://nfnn.cz/problems/content/news-slug-taken', status: 409 },
        { status: 409, statusText: 'Conflict' },
      );
    expect((failure as HttpErrorResponse).error).toEqual({
      type: 'https://nfnn.cz/problems/content/news-slug-taken',
      status: 409,
    });

    write(HELD);
    http.expectOne(URL).flush({ id: '7' });
    expect(answer).toEqual({ id: '7' });
  });
});
