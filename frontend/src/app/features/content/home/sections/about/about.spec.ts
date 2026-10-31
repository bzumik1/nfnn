import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { aboutPhoto, ABOUT_PHOTO_ID } from '../../../testing/about-fixtures';
import { PORTRAIT_ID, publicPeople, SIGNATURE_ID } from '../../../testing/people-fixtures';
import { About } from './about';

describe('Given the about section', () => {
  let fixture: ComponentFixture<About>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [About],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(About);
    fixture.detectChanges();
  });

  it('when it renders, then its photo waits until it is near and comes in two widths', () => {
    const image = (fixture.nativeElement as HTMLElement).querySelector('img')!;

    expect(image.getAttribute('srcset')).toBe(
      '/images/about-720.webp 720w, /images/about-1440.webp 1440w',
    );
    expect(image.getAttribute('loading')).toBe('lazy');
    expect(image.getAttribute('width')).toBe('720');
    expect(image.getAttribute('height')).toBe('480');
  });

  it('when it renders, then it opens with what the foundation does, then the work with FOD and then its founding', () => {
    const paragraphs = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.paragraph'),
    ).map((paragraph) => paragraph.textContent?.trim());

    expect(paragraphs[0]).toMatch(/^Nejsme velká organizace/);
    expect(paragraphs[1]).toMatch(/^Od svého počátku úzce spolupracujeme/);
    expect(paragraphs[2]).toMatch(/^Nová naděje – nadační fond byl zřízen/);
  });

  describe('when it renders who runs the foundation today', () => {
    function board(): HTMLElement {
      return (fixture.nativeElement as HTMLElement).querySelector('.board')!;
    }

    function text(element: Element | null): string {
      return element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    }

    it('then a heading under the founding story names it and the two founders follow with their roles', () => {
      expect(text(board().querySelector('h3'))).toBe('Kdo fond vede');
      expect(
        Array.from(board().querySelectorAll('.board-person')).map((person) => [
          text(person.querySelector('.board-name')),
          text(person.querySelector('.board-role')),
        ]),
      ).toEqual([
        ['Pavel Znamenáček', 'Zakladatel a předseda správní rady'],
        ['Andrea Znamenáčková', 'Zakladatelka a členka správní rady'],
      ]);
    });

    it('then the whole board is listed as in the registry, without the auditor', () => {
      expect(Array.from(board().querySelectorAll('.board-members')).map(text)).toEqual([
        'Správní rada: Pavel Znamenáček (předseda), Andrea Znamenáčková, Zdeňka Znamenáčková.',
      ]);
    });

    it('then their portraits stay out of the screen reader, since their names are beside them, and load late in two widths', () => {
      const portraits = Array.from(board().querySelectorAll('.board-person img'));

      expect(
        portraits.map((portrait) => portrait.getAttribute('srcset')?.replace(/\s+/g, ' ').trim()),
      ).toEqual([
        '/images/pavel-znamenacek-160.webp 160w, /images/pavel-znamenacek-320.webp 320w',
        '/images/andrea-znamenackova-160.webp 160w, /images/andrea-znamenackova-320.webp 320w',
      ]);
      for (const portrait of portraits) {
        expect(portrait.getAttribute('alt')).toBe('');
        expect(portrait.getAttribute('loading')).toBe('lazy');
        expect(portrait.getAttribute('width')).toBe('160');
        expect(portrait.getAttribute('height')).toBe('160');
      }
    });
  });

  describe('when an administrator has set a photo for it', () => {
    function root(): HTMLElement {
      return fixture.nativeElement as HTMLElement;
    }

    beforeEach(async () => {
      fixture.componentRef.setInput('photo', aboutPhoto());
      fixture.detectChanges();
      await fixture.whenStable();
    });

    it('then the photo replaces the placeholder as a figure with its description for screen readers and its caption under it', () => {
      const figure = root().querySelector('figure')!;

      expect(figure.querySelector('img')?.getAttribute('alt')).toBe(
        'Malý chlapec v náručí dvou dospělých',
      );
      expect(figure.querySelector('figcaption')?.textContent?.trim()).toBe('Kde to všechno začalo');
      expect(root().querySelector('img[src^="/images/about-"]')).toBeNull();
    });

    it('then the photo loads late, keeps the size of its original and comes in the widths the site stores', () => {
      const image = root().querySelector('figure img')!;

      expect(image.getAttribute('loading')).toBe('lazy');
      expect(image.getAttribute('width')).toBe('1413');
      expect(image.getAttribute('height')).toBe('1884');
      expect(image.getAttribute('src')).toBe(`/api/content/media/${ABOUT_PHOTO_ID}?w=480`);
      expect(image.getAttribute('srcset')).toBe(
        `/api/content/media/${ABOUT_PHOTO_ID}?w=480 480w, /api/content/media/${ABOUT_PHOTO_ID}?w=960 960w, /api/content/media/${ABOUT_PHOTO_ID}?w=1440 1413w`,
      );
    });

    it('then the badge about the work with FOD stays beside the photo, outside its caption', () => {
      const figure = root().querySelector('figure')!;

      expect(figure.querySelector('.about-badge')?.textContent).toContain('FOD');
      expect(figure.querySelector('figcaption .about-badge')).toBeNull();
    });

    it('and the photo is small and has neither texts, then it stays out of the screen reader without a caption and offers only its own width', async () => {
      fixture.componentRef.setInput(
        'photo',
        aboutPhoto({ width: 700, height: 500, alt: null, caption: null }),
      );
      fixture.detectChanges();
      await fixture.whenStable();

      const image = root().querySelector('figure img')!;
      expect(image.getAttribute('alt')).toBe('');
      expect(root().querySelector('figcaption')).toBeNull();
      expect(image.getAttribute('srcset')).toBe(
        `/api/content/media/${ABOUT_PHOTO_ID}?w=480 480w, /api/content/media/${ABOUT_PHOTO_ID}?w=1440 700w`,
      );
    });
  });

  describe('when an administrator keeps the people of the foundation', () => {
    function board(): HTMLElement {
      return (fixture.nativeElement as HTMLElement).querySelector('.board')!;
    }

    function text(element: Element | null): string {
      return element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    }

    beforeEach(async () => {
      fixture.componentRef.setInput('people', publicPeople());
      fixture.detectChanges();
      await fixture.whenStable();
    });

    it('then the featured people replace the built-in cards in their order, with their roles', () => {
      expect(text(board().querySelector('h3'))).toBe('Kdo fond vede');
      expect(
        Array.from(board().querySelectorAll('.board-person')).map((person) => [
          text(person.querySelector('.board-name')),
          text(person.querySelector('.board-role')),
        ]),
      ).toEqual([
        ['Eva Vzorová', 'Zakladatelka a předsedkyně správní rady'],
        ['Adam Vzor', 'Zakladatel a člen správní rady'],
      ]);
      expect(board().querySelector('img[src^="/images/"]')).toBeNull();
    });

    it('then a portrait loads late from the stored copy and stays out of the screen reader, and a card without one shows the initials instead', () => {
      const portrait = board().querySelector('.board-person img')!;

      expect(portrait.getAttribute('src')).toBe(`/api/content/media/${PORTRAIT_ID}?w=480`);
      expect(portrait.getAttribute('alt')).toBe('');
      expect(portrait.getAttribute('loading')).toBe('lazy');
      expect(portrait.getAttribute('width')).toBe('160');
      const initials = board().querySelectorAll('.board-person')[1].querySelector('.board-photo')!;
      expect(initials.getAttribute('aria-hidden')).toBe('true');
      expect(text(initials)).toBe('AV');
    });

    it('then the board line names every member with no-break spaces inside the names and the notes in parentheses', () => {
      const line = board().querySelector('.board-members')!;

      expect(line.textContent).toBe(
        'Správní rada: Eva\u00a0Vzorová (předsedkyně), Adam\u00a0Vzor, Hana\u00a0Vzorová.',
      );
    });

    it('then the founders note follows the cards in its paragraphs, with the signatures side by side and a name under each', () => {
      const note = board().querySelector('.founders-note')!;

      expect(Array.from(note.querySelectorAll('.founders-note-text')).map(text)).toEqual([
        'Fond jsme založili, abychom pomáhali konkrétním dětem.',
        'Děkujeme všem, kdo pomáhají s námi.',
      ]);
      const signatures = Array.from(note.querySelectorAll('.signature'));
      expect(
        signatures.map((signature) => text(signature.querySelector('.signature-name'))),
      ).toEqual(['Eva Vzorová']);
      const ink = signatures[0].querySelector('img')!;
      expect(ink.getAttribute('src')).toBe(`/api/content/media/${SIGNATURE_ID}?w=480`);
      expect(ink.getAttribute('alt')).toBe('');
      expect(ink.getAttribute('width')).toBe('600');
      expect(ink.getAttribute('height')).toBe('180');
      expect(
        board().querySelector('.board-people')!.compareDocumentPosition(note) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('then the line under the board follows the board line as its own paragraph', () => {
      const line = board().querySelector('.board-members')!;
      const footnote = board().querySelector('.board-footnote')!;

      expect(text(footnote)).toBe('Web zajišťuje bez nároku na odměnu Petr Vzor.');
      expect(
        line.compareDocumentPosition(footnote) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('and there is no note, nobody featured, nobody on the board and no line under it, then only the heading stays', async () => {
      fixture.componentRef.setInput(
        'people',
        publicPeople({ featured: [], board: [], note: null, footnote: null }),
      );
      fixture.detectChanges();
      await fixture.whenStable();

      expect(board().querySelector('.board-people')).toBeNull();
      expect(board().querySelector('.founders-note')).toBeNull();
      expect(board().querySelector('.board-members')).toBeNull();
      expect(board().querySelector('.board-footnote')).toBeNull();
      expect(text(board().querySelector('h3'))).toBe('Kdo fond vede');
    });
  });
});
