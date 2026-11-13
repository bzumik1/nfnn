import { Subject } from 'rxjs';
import { ListChanges } from './list-changes';

describe('Given the changes a card makes to a list it loads', () => {
  let reloads: number;
  let changes: ListChanges;

  beforeEach(() => {
    reloads = 0;
    changes = new ListChanges(() => reloads++);
  });

  function load(): { seen: string[]; server: Subject<string> } {
    const server = new Subject<string>();
    const seen: string[] = [];
    changes.track(server).subscribe((answer) => seen.push(answer));
    return { seen, server };
  }

  it('when no change happens, then the answer is shown and nothing is asked again', () => {
    const { seen, server } = load();
    server.next('list');

    expect(seen).toEqual(['list']);
    expect(reloads).toBe(0);
  });

  it('when a change happens while the answer is on its way, then the answer is set aside and the list is asked for again once the change ends', () => {
    const { seen, server } = load();
    changes.changing();
    server.next('before the change');

    expect(seen).toEqual([]);
    expect(reloads).toBe(0);

    changes.changed();

    expect(reloads).toBe(1);
  });

  it('when the answer comes after the change ended, then it is set aside and the list is asked for again at once', () => {
    const { seen, server } = load();
    changes.changing();
    changes.changed();
    expect(reloads).toBe(0);

    server.next('before the change');

    expect(seen).toEqual([]);
    expect(reloads).toBe(1);
  });

  it('when two changes overlap, then the list is asked for again only once both ended', () => {
    const { server } = load();
    changes.changing();
    changes.changing();
    server.next('before the changes');
    changes.changed();

    expect(reloads).toBe(0);

    changes.changed();

    expect(reloads).toBe(1);
  });

  it('when a load starts while a change runs, then its answer is set aside too', () => {
    changes.changing();
    const { seen, server } = load();
    server.next('during the change');
    changes.changed();

    expect(seen).toEqual([]);
    expect(reloads).toBe(1);
  });

  it('when a change ends that loads the list itself, then nothing more is asked for', () => {
    const { server } = load();
    changes.changing();
    server.next('before the change');
    changes.changed(false);

    expect(reloads).toBe(0);
  });

  it('when a new load starts while the change runs, then its answer, older than the change, is set aside and the list is asked for again', () => {
    const first = load();
    changes.changing();
    first.server.next('before the change');
    const second = load();
    changes.changed();

    expect(reloads).toBe(0);

    second.server.next('during the change');

    expect(second.seen).toEqual([]);
    expect(reloads).toBe(1);
  });

  it('when a load started after the change already asks for the list, then an older answer is set aside without asking again', () => {
    const before = load();
    changes.changing();
    changes.changed(false);
    const after = load();

    before.server.next('before the change');
    after.server.next('after the change');

    expect(before.seen).toEqual([]);
    expect(after.seen).toEqual(['after the change']);
    expect(reloads).toBe(0);
  });

  it('when a change answers with the fresh list itself, then an older answer is set aside without asking again', () => {
    const before = load();
    changes.answeredByChange();

    before.server.next('before the change');

    expect(before.seen).toEqual([]);
    expect(reloads).toBe(0);
  });

  it('when the load begun after the change fails, then the list is asked for again', () => {
    const before = load();
    changes.changing();
    changes.changed(false);
    const server = new Subject<string>();
    changes.track(server).subscribe({ error: () => undefined });
    before.server.next('before the change');

    server.error(new Error('offline'));

    expect(reloads).toBe(1);
  });

  it('when the load begun after the change is dropped before it answers, then the list is asked for again', () => {
    const before = load();
    changes.changing();
    changes.changed(false);
    const server = new Subject<string>();
    const after = changes.track(server).subscribe();
    before.server.next('before the change');

    after.unsubscribe();

    expect(reloads).toBe(1);
  });

  it('when the load begun after the change answers before an older one, then the older answer leaves nothing to ask for later', () => {
    const before = load();
    changes.changing();
    changes.changed(false);
    const after = load();
    after.server.next('after the change');
    before.server.next('before the change');

    changes.changing();
    changes.changed();

    expect(before.seen).toEqual([]);
    expect(reloads).toBe(0);
  });
});
