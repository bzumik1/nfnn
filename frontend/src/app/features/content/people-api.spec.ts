import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { heldRecordOf } from '../../core/version/row-version';
import { PeopleApi, PeopleResponse, PersonRequest } from './people-api';
import { OTHER_PERSON_ID, person, PERSON_ID, SIGNATURE_ID } from './testing/people-fixtures';

const PEOPLE = '/api/admin/content/people';

function request(): PersonRequest {
  return {
    name: 'Eva Vzorová',
    role: null,
    onBoard: true,
    boardNote: null,
    featured: true,
    portraitId: null,
    personalEmail: 'eva@example.org',
    fundEmail: 'eva@nfnn.cz',
  };
}

describe('Given the API of the people of the foundation', () => {
  let api: PeopleApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(PeopleApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('when the people are loaded, then it asks the administration and hands the members, the note and the line under the board on', () => {
    let received: PeopleResponse | undefined;
    api.load().subscribe((response) => (received = response));

    const call = http.expectOne(PEOPLE);
    expect(call.request.method).toBe('GET');
    const people = {
      members: [person()],
      note: 'Děkujeme.',
      footnote: 'Web zajišťuje Petr Vzor.',
      noteVersion: '00000000000000a1',
      footnoteVersion: '00000000000000b1',
    };
    call.flush(people);

    expect(received).toEqual(people);
  });

  it('when a person is added and updated, then every field goes in the body, the e-mails too', () => {
    api.add(request()).subscribe();
    api.update(PERSON_ID, request()).subscribe();

    const added = http.expectOne((call) => call.method === 'POST' && call.url === PEOPLE);
    expect(added.request.body).toEqual(request());
    added.flush(person());
    const updated = http.expectOne(`${PEOPLE}/${PERSON_ID}`);
    expect(updated.request.method).toBe('PUT');
    expect(updated.request.body).toEqual(request());
    updated.flush(person());
  });

  it('when the people are ordered, the note and the line under the board are saved and a person is removed, then each goes to its own address', () => {
    api.order([OTHER_PERSON_ID, PERSON_ID]).subscribe();
    api.saveNote(null, '00000000000000a1', { text: 'Děkujeme.' }).subscribe();
    api.saveFootnote('Web zajišťuje Petr Vzor.', '00000000000000b1', { text: null }).subscribe();
    api.remove(PERSON_ID).subscribe();

    const order = http.expectOne(`${PEOPLE}/order`);
    expect(order.request.method).toBe('PUT');
    expect(order.request.body).toEqual({ memberIds: [OTHER_PERSON_ID, PERSON_ID] });
    order.flush({
      members: [],
      note: null,
      footnote: null,
      noteVersion: '00000000000000a1',
      footnoteVersion: '00000000000000b1',
    });
    const note = http.expectOne(`${PEOPLE}/note`);
    expect(note.request.method).toBe('PUT');
    expect(note.request.body).toEqual({ text: null });
    expect(note.request.headers.get('If-Match')).toBe('"00000000000000a1"');
    expect(heldRecordOf(note.request.context)).toEqual({ text: 'Děkujeme.' });
    note.flush({ text: null, version: '00000000000000a2' });
    const footnote = http.expectOne(`${PEOPLE}/footnote`);
    expect(footnote.request.method).toBe('PUT');
    expect(footnote.request.body).toEqual({ text: 'Web zajišťuje Petr Vzor.' });
    expect(footnote.request.headers.get('If-Match')).toBe('"00000000000000b1"');
    expect(heldRecordOf(footnote.request.context)).toEqual({ text: null });
    footnote.flush({ text: 'Web zajišťuje Petr Vzor.', version: '00000000000000b2' });
    const removed = http.expectOne(`${PEOPLE}/${PERSON_ID}`);
    expect(removed.request.method).toBe('DELETE');
    removed.flush(null);
  });

  it('when a signature is set and removed, then the image id goes to the signature address', () => {
    api.setSignature(PERSON_ID, SIGNATURE_ID).subscribe();
    api.removeSignature(PERSON_ID).subscribe();

    const set = http.expectOne((call) => call.method === 'POST');
    expect(set.request.url).toBe(`${PEOPLE}/${PERSON_ID}/signature`);
    expect(set.request.body).toEqual({ imageId: SIGNATURE_ID });
    set.flush(person());
    const removed = http.expectOne((call) => call.method === 'DELETE');
    expect(removed.request.url).toBe(`${PEOPLE}/${PERSON_ID}/signature`);
    removed.flush(person());
  });
});
