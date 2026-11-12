import { Component } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { DRAFT_KEEP_DELAY_MS } from './draft-shelf';
import { formDraft, stableJson } from './form-draft';
import {
  MemoryDraftShelf,
  memoryDraftShelfProviders,
  valuesBase,
} from './testing/memory-draft-shelf';

interface NoteValues {
  readonly title: string;
  readonly body: string;
}

@Component({
  imports: [FormsModule],
  template: `<form>
    <input name="title" [(ngModel)]="title" />
    <textarea name="body" [(ngModel)]="body"></textarea>
  </form>`,
})
class NoteEditor {
  title = 'Ples';
  body = 'Zveme vás.';
  readonly draft = formDraft<NoteValues>({
    copy: 'administration',
    key: () => 'news/1',
    values: () => ({ title: this.title, body: this.body }),
    apply: (values) => {
      this.title = values.title;
      this.body = values.body;
    },
  });
}

describe('Given an editor that keeps its unsaved text as a draft', () => {
  let shelf: MemoryDraftShelf;
  let fixture: ComponentFixture<NoteEditor>;
  let editor: NoteEditor;

  async function create(delayMs = 0): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        ...memoryDraftShelfProviders(shelf),
        { provide: DRAFT_KEEP_DELAY_MS, useValue: delayMs },
      ],
    });
    fixture = TestBed.createComponent(NoteEditor);
    editor = fixture.componentInstance;
    await fixture.whenStable();
  }

  async function type(name: 'title' | 'body', text: string): Promise<void> {
    const field = (fixture.nativeElement as HTMLElement).querySelector<
      HTMLInputElement | HTMLTextAreaElement
    >(`[name="${name}"]`)!;
    field.value = text;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  }

  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await editor.draft.flush();
    await fixture.whenStable();
  }

  async function ready(version?: string): Promise<void> {
    editor.draft.ready(version);
    await settle();
    await settle();
  }

  beforeEach(() => {
    shelf = new MemoryDraftShelf();
  });

  describe('when the form shows a saved article of version v1', () => {
    beforeEach(async () => {
      await create();
      await fixture.whenStable();
      await ready('v1');
    });

    it('and a field is typed into, then the whole form is kept under the version it was read at', async () => {
      await type('title', 'Ples 2026');

      const kept = shelf.draftOf('administration', 'news/1');
      expect(kept).toMatchObject({
        key: 'news/1',
        base: 'version:v1',
        values: { title: 'Ples 2026', body: 'Zveme vás.' },
      });
      expect(Date.parse(kept!.savedAt)).not.toBeNaN();
      expect(editor.draft.offer()).toBeNull();
    });

    it('and the text is typed back to what is saved, then the draft is dropped', async () => {
      await type('title', 'Ples 2026');

      await type('title', 'Ples');

      expect(shelf.draftOf('administration', 'news/1')).toBeNull();
    });

    it('and it is saved as v2, then the draft is dropped and later edits are kept under v2', async () => {
      await type('title', 'Ples 2026');

      editor.draft.saved('v2');
      await settle();
      expect(shelf.draftOf('administration', 'news/1')).toBeNull();

      await type('body', 'Zveme vás všechny.');
      expect(shelf.draftOf('administration', 'news/1')?.base).toBe('version:v2');
    });

    it('and the record moves to v2 by another change of its own while the edit stays unsaved, then the draft is kept under v2', async () => {
      await type('title', 'Ples 2026');

      editor.draft.rebased('v2');
      await settle();

      expect(shelf.draftOf('administration', 'news/1')).toMatchObject({
        base: 'version:v2',
        values: { title: 'Ples 2026' },
      });
      expect(editor.draft.offer()).toBeNull();
    });

    it('and the visitor leaves without saving, then the draft is dropped and nothing more is kept', async () => {
      await type('title', 'Ples 2026');

      editor.draft.left();
      await settle();
      await type('title', 'Ples 2027');

      expect(shelf.draftOf('administration', 'news/1')).toBeNull();
    });

    it('and the copy closes and opens again after an edit, then the edit is not offered back to the page that wrote it', async () => {
      await type('title', 'Ples 2026');

      shelf.setOpen('administration', false);
      await settle();
      shelf.setOpen('administration', true);
      await settle();

      expect(editor.draft.offer()).toBeNull();
      expect(editor.title).toBe('Ples 2026');
    });

    it('and the component goes away with an edit not yet kept, then the edit is kept', async () => {
      editor.title = 'Ples 2026';
      editor.draft.changed();

      fixture.destroy();
      await editor.draft.flush();

      expect(shelf.draftOf('administration', 'news/1')?.values).toEqual({
        title: 'Ples 2026',
        body: 'Zveme vás.',
      });
    });
  });

  describe('when the copy holds a draft of the same version', () => {
    beforeEach(async () => {
      shelf.seed('administration', {
        key: 'news/1',
        base: 'version:v1',
        values: { title: 'Ples 2026', body: 'Zveme vás.' },
        savedAt: '2026-11-06T09:00:00.000Z',
      });
      await create();
      await ready('v1');
    });

    it('then it is offered, not stale, and the form keeps the saved text until the visitor chooses', () => {
      expect(editor.draft.offer()).toEqual({ savedAt: '2026-11-06T09:00:00.000Z', stale: false });
      expect(editor.title).toBe('Ples');
    });

    it('and the visitor types before choosing, then the offered draft stays as it was', async () => {
      await type('body', 'Něco jiného.');

      expect(shelf.draftOf('administration', 'news/1')?.values).toEqual({
        title: 'Ples 2026',
        body: 'Zveme vás.',
      });
    });

    it('and the visitor resumes it, then the form takes its text and later edits keep it under v1', async () => {
      editor.draft.resume();
      await settle();

      expect(editor.title).toBe('Ples 2026');
      expect(editor.draft.offer()).toBeNull();
      expect(editor.draft.resumedStale()).toBe(false);
      await type('body', 'Zveme vás všechny.');
      expect(shelf.draftOf('administration', 'news/1')).toMatchObject({
        base: 'version:v1',
        values: { title: 'Ples 2026', body: 'Zveme vás všechny.' },
      });
    });

    it('and the visitor had typed before the offer showed and discards it, then what they typed is kept instead', async () => {
      editor.body = 'Něco jiného.';

      editor.draft.discard();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await editor.draft.settled();

      expect(shelf.draftOf('administration', 'news/1')?.values).toEqual({
        title: 'Ples',
        body: 'Něco jiného.',
      });
    });

    it('and the visitor leaves without answering, then the offered draft stays for the next visit', async () => {
      editor.draft.left();
      await settle();

      expect(shelf.draftOf('administration', 'news/1')?.values).toEqual({
        title: 'Ples 2026',
        body: 'Zveme vás.',
      });
    });

    it('and the visitor discards it, then it is dropped and the form keeps the saved text', async () => {
      editor.draft.discard();
      await settle();

      expect(shelf.draftOf('administration', 'news/1')).toBeNull();
      expect(editor.draft.offer()).toBeNull();
      expect(editor.title).toBe('Ples');
    });
  });

  describe('when the copy holds a draft of an older version', () => {
    beforeEach(async () => {
      shelf.seed('administration', {
        key: 'news/1',
        base: 'version:v0',
        values: { title: 'Ples 2026', body: 'Zveme vás.' },
        savedAt: '2026-11-06T09:00:00.000Z',
      });
      await create();
      await ready('v1');
    });

    it('then it is offered as stale', () => {
      expect(editor.draft.offer()?.stale).toBe(true);
    });

    it('and the visitor resumes it, then the save is to name the older version, so the server refuses it as changed meanwhile', async () => {
      editor.draft.resume();
      await settle();

      expect(editor.draft.resumedStale()).toBe(true);
      expect(editor.draft.staleVersion()).toBe('v0');
      await type('body', 'Zveme vás všechny.');
      expect(shelf.draftOf('administration', 'news/1')?.base).toBe('version:v0');
    });

    it('and the visitor resumes it and confirms the overwrite, then it is no longer stale', async () => {
      editor.draft.resume();

      editor.draft.overwriteConfirmed();

      expect(editor.draft.resumedStale()).toBe(false);
      expect(editor.draft.staleVersion()).toBeNull();
    });
  });

  describe('when the copy holds a draft equal to what is saved now', () => {
    it('then nothing is offered and the draft is dropped', async () => {
      shelf.seed('administration', {
        key: 'news/1',
        base: 'version:v0',
        values: { body: 'Zveme vás.', title: 'Ples' },
        savedAt: '2026-11-06T09:00:00.000Z',
      });
      await create();
      await ready('v1');

      expect(editor.draft.offer()).toBeNull();
      expect(shelf.draftOf('administration', 'news/1')).toBeNull();
    });
  });

  describe('when the form shows a record without a version', () => {
    it('and the copy holds a draft started from the same saved text, then it is offered, not stale', async () => {
      await create();
      await ready();
      await type('title', 'Ples 2026');
      const kept = shelf.draftOf('administration', 'news/1')!;
      expect(kept.base).toMatch(/^values:[0-9a-f]{64}$/);
      TestBed.resetTestingModule();

      await create();
      await ready();

      expect(editor.draft.offer()?.stale).toBe(false);
    });

    it('and the saved text changed since the draft was started, then the draft is offered as stale and names no version', async () => {
      await create();
      await ready();
      await type('title', 'Ples 2026');
      TestBed.resetTestingModule();

      await create();
      editor.body = 'Zveme vás, přijďte.';
      await ready();
      editor.draft.resume();

      expect(editor.draft.resumedStale()).toBe(true);
      expect(editor.draft.staleVersion()).toBeNull();
    });
  });

  describe('when the form shows a record without a version and the visitor types at once', () => {
    it('then the edit is kept once the saved text is digested', async () => {
      await create();
      editor.draft.ready();
      editor.title = 'Ples 2026';
      editor.draft.changed();

      await vi.waitFor(async () => {
        await editor.draft.settled();
        expect(shelf.draftOf('administration', 'news/1')).toMatchObject({
          base: expect.stringMatching(/^values:[0-9a-f]{64}$/),
          values: { title: 'Ples 2026', body: 'Zveme vás.' },
        });
      });
    });
  });

  describe('when the copy is not open yet as the form shows its record', () => {
    it('then the draft is offered once the copy opens', async () => {
      shelf.seed('administration', {
        key: 'news/1',
        base: 'version:v1',
        values: { title: 'Ples 2026', body: 'Zveme vás.' },
        savedAt: '2026-11-06T09:00:00.000Z',
      });
      shelf.setOpen('administration', false);
      await create();
      await ready('v1');
      expect(editor.draft.offer()).toBeNull();

      shelf.setOpen('administration', true);
      await settle();
      await settle();

      expect(editor.draft.offer()?.stale).toBe(false);
    });
  });

  describe('when another account takes over the copy while the form is open', () => {
    it('then later edits are kept in no copy and nothing is offered to the other account', async () => {
      await create();
      await ready('v1');
      await type('title', 'Ples 2026');
      expect(shelf.draftOf('administration', 'news/1')).not.toBeNull();

      shelf.switchAccount('administration', 'another-administration-copy');
      await settle();
      await type('body', 'Zveme vás všechny.');

      expect(shelf.draftOf('administration', 'news/1')).toBeNull();
      expect(shelf.kept.at(-1)?.values).toEqual({ title: 'Ples 2026', body: 'Zveme vás.' });
      expect(editor.draft.offer()).toBeNull();
    });

    it('and the form is discarded or saved after the switch, then the draft the other account keeps of the same form stays', async () => {
      await create();
      await ready('v1');
      await type('title', 'Ples 2026');
      shelf.switchAccount('administration', 'another-administration-copy');
      await settle();
      const theirs = {
        key: 'news/1',
        base: 'version:v1',
        values: { title: 'Jejich ples', body: 'Zveme vás.' },
        savedAt: '2026-11-06T09:00:00.000Z',
      };
      shelf.seed('administration', theirs);

      editor.draft.discard();
      editor.draft.saved('v2');
      await settle();

      expect(shelf.draftOf('administration', 'news/1')).toEqual(theirs);
      expect(editor.draft.offer()).toBeNull();
    });
  });

  describe('when the visitor types while the copy is still closed', () => {
    it('then the edit is kept as soon as the copy opens, without another keystroke', async () => {
      shelf.setOpen('administration', false);
      await create();
      await ready('v1');
      editor.title = 'Ples 2026';
      editor.draft.changed();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await editor.draft.settled();
      expect(shelf.draftOf('administration', 'news/1')).toBeNull();

      shelf.setOpen('administration', true);
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await editor.draft.settled();

      expect(shelf.draftOf('administration', 'news/1')?.values).toEqual({
        title: 'Ples 2026',
        body: 'Zveme vás.',
      });
    });
  });

  describe('when the visitor types before the copy opens and it holds an older draft', () => {
    it('then the older draft is offered once the copy opens', async () => {
      shelf.seed('administration', {
        key: 'news/1',
        base: 'version:v1',
        values: { title: 'Ples 2026', body: 'Zveme vás.' },
        savedAt: '2026-11-06T09:00:00.000Z',
      });
      shelf.setOpen('administration', false);
      await create();
      await ready('v1');

      await type('body', 'Něco jiného.');
      shelf.setOpen('administration', true);
      await settle();
      await settle();

      expect(editor.draft.offer()?.savedAt).toBe('2026-11-06T09:00:00.000Z');
      expect(shelf.draftOf('administration', 'news/1')?.values).toEqual({
        title: 'Ples 2026',
        body: 'Zveme vás.',
      });
    });
  });

  describe('when later edits wait a while before they are kept', () => {
    beforeEach(async () => {
      await create(60_000);
      await ready('v1');
    });

    afterEach(() => {
      Reflect.deleteProperty(document, 'visibilityState');
    });

    async function firstEditKept(): Promise<void> {
      editor.title = 'Ples 2026';
      editor.draft.changed();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await editor.draft.settled();
    }

    it('then the first edit is kept at once and the next one waits', async () => {
      await firstEditKept();
      expect(shelf.draftOf('administration', 'news/1')?.values).toEqual({
        title: 'Ples 2026',
        body: 'Zveme vás.',
      });

      editor.body = 'Zveme vás všechny.';
      editor.draft.changed();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(shelf.draftOf('administration', 'news/1')?.values).toMatchObject({
        body: 'Zveme vás.',
      });
    });

    it('and the page is hidden, then the waiting edit is kept at once', async () => {
      await firstEditKept();
      editor.body = 'Zveme vás všechny.';
      editor.draft.changed();

      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      await editor.draft.settled();

      expect(shelf.draftOf('administration', 'news/1')?.values).toEqual({
        title: 'Ples 2026',
        body: 'Zveme vás všechny.',
      });
    });

    it('and the page is left, then the waiting edit is kept at once', async () => {
      await firstEditKept();
      editor.body = 'Zveme vás všechny.';
      editor.draft.changed();

      window.dispatchEvent(new Event('pagehide'));
      await editor.draft.settled();

      expect(shelf.draftOf('administration', 'news/1')?.values).toMatchObject({
        body: 'Zveme vás všechny.',
      });
    });
  });
});

@Component({
  imports: [FormsModule],
  template: `<form>
    <input name="title" [(ngModel)]="title" />
    <textarea name="body" [(ngModel)]="body"></textarea>
  </form>`,
})
class SettingsEditor {
  title = 'Ples';
  body = 'Zveme vás.';
  readonly draft = formDraft<NoteValues>({
    copy: 'administration',
    key: () => 'settings',
    values: () => ({ title: this.title, body: this.body }),
    apply: (values) => {
      this.title = values.title;
      this.body = values.body;
    },
    changedFieldsOnly: true,
  });
}

describe('Given an editor that keeps only the fields the visitor changed', () => {
  let shelf: MemoryDraftShelf;
  let fixture: ComponentFixture<SettingsEditor>;
  let editor: SettingsEditor;

  async function create(): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        ...memoryDraftShelfProviders(shelf),
        { provide: DRAFT_KEEP_DELAY_MS, useValue: 0 },
      ],
    });
    fixture = TestBed.createComponent(SettingsEditor);
    editor = fixture.componentInstance;
    await fixture.whenStable();
  }

  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await editor.draft.flush();
    await fixture.whenStable();
  }

  beforeEach(() => {
    shelf = new MemoryDraftShelf();
  });

  it('when the title is typed into, then only the title is kept', async () => {
    await create();
    editor.draft.ready();
    await settle();
    await settle();

    editor.title = 'Ples 2026';
    editor.draft.changed();
    await settle();

    expect(shelf.draftOf('administration', 'settings')?.values).toEqual({ title: 'Ples 2026' });
  });

  it('when a stale draft of the title is resumed after someone else changed the body, then the newer body stays', async () => {
    shelf.seed('administration', {
      key: 'settings',
      base: await valuesBase({ title: 'Ples', body: 'Zveme vás.' }),
      values: { title: 'Ples 2026' },
      savedAt: '2026-11-06T09:00:00.000Z',
    });
    await create();
    editor.body = 'Zveme vás všechny.';
    editor.draft.ready();
    await settle();
    await settle();
    expect(editor.draft.offer()?.stale).toBe(true);

    editor.draft.resume();

    expect(editor.title).toBe('Ples 2026');
    expect(editor.body).toBe('Zveme vás všechny.');
    expect(editor.draft.resumedStale()).toBe(true);
  });

  it('when the kept field already holds the saved value, then nothing is offered and the draft is dropped', async () => {
    shelf.seed('administration', {
      key: 'settings',
      base: await valuesBase({ title: 'Ples', body: 'Zveme vás.' }),
      values: { title: 'Ples 2026' },
      savedAt: '2026-11-06T09:00:00.000Z',
    });
    await create();
    editor.title = 'Ples 2026';
    editor.draft.ready();
    await settle();
    await settle();

    expect(editor.draft.offer()).toBeNull();
    expect(shelf.draftOf('administration', 'settings')).toBeNull();
  });
});

describe('Given values to compare', () => {
  it('when two objects hold the same fields in another order, then their stable JSON is the same', () => {
    expect(stableJson({ b: 1, a: { d: [1, { f: 2, e: 3 }], c: null } })).toBe(
      stableJson({ a: { c: null, d: [1, { e: 3, f: 2 }] }, b: 1 }),
    );
  });
});
