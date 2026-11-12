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

  function write(held?: object, mayDiffer?: readonly string[]): void {
    client.put(URL, { title: 'Léto' }, ifMatch('0000000000000001', held, mayDiffer)).subscribe({
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
    const stored = { id: '7', title: 'Léto', perex: 'Krátce' };
    write(HELD);
    refuse('00000000000000ff', stored);
    refuse('0000000000000aaa', stored);

    expect((failure as HttpErrorResponse).status).toBe(409);
    expect((failure as HttpErrorResponse).error).toEqual(
      changedMeanwhile('0000000000000aaa', stored),
    );
  });

  it('when the stored record has a field the held one lacks, then it counts as a change and the refusal passes through', () => {
    write(HELD);
    refuse('00000000000000ff', { id: '7', title: 'Léto', perex: 'Krátce', storyYear: 2026 });

    expect((failure as HttpErrorResponse).status).toBe(409);
    expect(answer).toBeUndefined();
  });

  it('when the held record has a field the stored one lacks, then it counts as a change and the refusal passes through', () => {
    write({ ...HELD, tag: 'x' });
    refuse('00000000000000ff', { id: '7', title: 'Léto', perex: 'Krátce' });

    expect((failure as HttpErrorResponse).status).toBe(409);
  });

  it('when the two name the same value under different keys, then it counts as a change and the refusal passes through', () => {
    write({ id: '7', account: '19-2000145399/0800' });
    refuse('00000000000000ff', { id: '7', accountNumber: '35-1000145399/0800' });

    expect((failure as HttpErrorResponse).status).toBe(409);
  });

  it('when the held record leaves a field undefined that the stored one lacks, then the two count as the same and the write goes once more', () => {
    write({ ...HELD, tag: undefined });
    refuse('00000000000000ff', { id: '7', title: 'Léto', perex: 'Krátce' });

    http.expectOne(URL).flush({ id: '7' });

    expect(answer).toEqual({ id: '7' });
  });

  it('when the held record leaves a field undefined that the stored one holds, then it counts as a change and the refusal passes through', () => {
    write({ ...HELD, tag: undefined });
    refuse('00000000000000ff', { id: '7', title: 'Léto', perex: 'Krátce', tag: 'Tábor' });

    expect((failure as HttpErrorResponse).status).toBe(409);
  });

  it('when the two share only the id, then nothing is compared and the refusal passes through', () => {
    write({ id: '7', version: '0000000000000001' });
    refuse('00000000000000ff', { id: '7' });

    expect((failure as HttpErrorResponse).status).toBe(409);
  });

  it('when only the stored timestamps differ or are missing from the held record, then the write goes once more', () => {
    write({ ...HELD, createdAt: '2026-11-01T08:00:00Z' });
    refuse('00000000000000ff', {
      id: '7',
      title: 'Léto',
      perex: 'Krátce',
      createdAt: '2026-11-02T08:00:00Z',
      updatedAt: '2026-11-05T15:20:00Z',
    });

    http.expectOne(URL).flush({ id: '7' });

    expect(answer).toEqual({ id: '7' });
  });

  it('when the stored record has a field the write names as allowed to differ, then the write goes once more', () => {
    write(HELD, ['sentReports']);
    refuse('00000000000000ff', {
      id: '7',
      title: 'Léto',
      perex: 'Krátce',
      sentReports: [{ month: '2026-10', sentAt: '2026-11-01T06:00:00Z' }],
    });

    http.expectOne(URL).flush({ id: '7' });

    expect(answer).toEqual({ id: '7' });
  });

  it('when the write carries no held record, then the refusal passes through', () => {
    write();
    refuse('00000000000000ff', { title: 'Léto' });

    expect((failure as HttpErrorResponse).status).toBe(409);
  });

  it('when the refusal names no version or no stored record, then it passes through', () => {
    write(HELD);
    refuse('', { id: '7', title: 'Léto', perex: 'Krátce' });
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
