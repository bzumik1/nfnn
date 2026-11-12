import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { aboutPhoto, ABOUT_PHOTO_ID } from '../../../testing/about-fixtures';
import { PORTRAIT_ID, publicPeople, SIGNATURE_ID } from '../../../testing/people-fixtures';
import { DialogHistory } from '../../../../../shared/ui/dialog/dialog-history';
import { FakeDialogHistory } from '../../../../../shared/ui/dialog/testing/fake-dialog-history';
import { About } from './about';

function text(element: Element | null): string {
  return element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

describe('Given the about section', () => {
  let fixture: ComponentFixture<About>;

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function founders(): HTMLElement {
    return root().querySelector('.founders')!;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [About],
      providers: [provideRouter([]), { provide: DialogHistory, useClass: FakeDialogHistory }],
    }).compileComponents();
    fixture = TestBed.createComponent(About);
    fixture.detectChanges();
  });

  it('when it renders, then it opens with what the foundation does, then the work with FOD with the figures under it', () => {
    expect(text(root().querySelector('h1'))).toBe('Vznik a poslání');
    expect(text(root().querySelector('.lead'))).toMatch(/^Nejsme velká organizace/);
    const rest = root().querySelector('.intro-rest')!;
    expect(text(rest.querySelector('.paragraph'))).toMatch(/^Od svého počátku úzce spolupracujeme/);
    expect(rest.querySelector('app-stats-bar')).not.toBeNull();
  });

  it('when it renders, then the placeholder photo waits until it is near, comes in two widths and is cropped square around the middle', () => {
    const image = root().querySelector<HTMLImageElement>('figure img')!;

    expect(image.getAttribute('srcset')).toBe(
      '/images/about-720.webp 720w, /images/about-1440.webp 1440w',
    );
    expect(image.getAttribute('loading')).toBe('lazy');
    expect(image.style.objectPosition).toBe('50% 40%');
    expect(text(root().querySelector('figure .about-badge'))).toBe(
      'FOD Úzká spolupráce s Fondem ohrožených dětí',
    );
  });

  describe('when it renders who runs the foundation without the administration', () => {
    it('then a heading names them and the two founders follow with their roles', () => {
      expect(text(founders().querySelector('h2'))).toBe('Kdo fond vede');
      expect(
        Array.from(founders().querySelectorAll('.signer')).map((signer) => [
          text(signer.querySelector('.signer-name')),
          text(signer.querySelector('.signer-role')),
        ]),
      ).toEqual([
        ['Pavel Znamenáček', 'Zakladatel a předseda správní rady'],
        ['Andrea Znamenáčková', 'Zakladatelka a členka správní rady'],
      ]);
    });

    it('then the whole board is listed as in the registry, without the auditor', () => {
      expect(Array.from(founders().querySelectorAll('.board-members')).map(text)).toEqual([
        'Správní rada: Pavel Znamenáček (předseda), Andrea Znamenáčková, Zdeňka Znamenáčková.',
      ]);
    });

    it('then their portraits stay out of the screen reader, since their names are beside them, and load late in two widths', () => {
      const portraits = Array.from(founders().querySelectorAll('.signer img'));

      expect(portraits.map((portrait) => portrait.getAttribute('srcset'))).toEqual([
        '/images/pavel-znamenacek-160.webp 160w, /images/pavel-znamenacek-320.webp 320w',
        '/images/andrea-znamenackova-160.webp 160w, /images/andrea-znamenackova-320.webp 320w',
      ]);
      for (const portrait of portraits) {
        expect(portrait.getAttribute('alt')).toBe('');
        expect(portrait.getAttribute('loading')).toBe('lazy');
      }
    });
  });

  describe('when an administrator has set a photo for it', () => {
    beforeEach(async () => {
      fixture.componentRef.setInput('photo', aboutPhoto({ focalPoint: { x: 30, y: 25 } }));
      await fixture.whenStable();
    });

    it('then the photo replaces the placeholder as a figure with its description for screen readers and its caption under it', () => {
      const figure = root().querySelector('figure')!;

      expect(figure.querySelector('img')?.getAttribute('alt')).toBe(
        'Malý chlapec v náručí dvou dospělých',
      );
      expect(text(figure.querySelector('figcaption'))).toBe('Kde to všechno začalo');
      expect(root().querySelector('img[src^="/images/about-"]')).toBeNull();
    });

    it('then the photo is cropped square around the point the administration chose', () => {
      expect(root().querySelector<HTMLImageElement>('figure img')!.style.objectPosition).toBe(
        '30% 25%',
      );
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

    it('then the photo is a button that opens it enlarged at the largest width the site stores, uncropped', async () => {
      const trigger = root().querySelector('figure app-zoomable button') as HTMLButtonElement;
      expect(trigger.getAttribute('aria-label')).toBe(
        'Zvětšit fotku: Malý chlapec v náručí dvou dospělých',
      );

      document.body.appendChild(root());
      trigger.click();
      await fixture.whenStable();

      const enlarged = root().querySelector('dialog .zoom-stage img')!;
      expect(enlarged.getAttribute('src')).toBe(`/api/content/media/${ABOUT_PHOTO_ID}?w=1440`);
      expect(enlarged.getAttribute('width')).toBe('1413');
      expect(enlarged.getAttribute('height')).toBe('1884');
      root().remove();
    });

    it('then the badge about the work with FOD stays on the photo, outside its caption and outside the button', () => {
      const figure = root().querySelector('figure')!;

      expect(figure.querySelector('.about-badge')?.textContent).toContain('FOD');
      expect(figure.querySelector('figcaption .about-badge')).toBeNull();
      expect(figure.querySelector('button .about-badge')).toBeNull();
    });

    it('and the photo is small and has neither texts, then it stays out of the screen reader without a caption and offers only its own width', async () => {
      fixture.componentRef.setInput(
        'photo',
        aboutPhoto({ width: 700, height: 500, alt: null, caption: null }),
      );
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
    beforeEach(async () => {
      fixture.componentRef.setInput('people', publicPeople());
      await fixture.whenStable();
    });

    it("then the founders' note is a quote in its paragraphs under a heading only a screen reader hears", () => {
      const quote = founders().querySelector('blockquote')!;
      expect(Array.from(quote.querySelectorAll('p')).map(text)).toEqual([
        'Fond jsme založili, abychom pomáhali konkrétním dětem.',
        'Děkujeme všem, kdo pomáhají s námi.',
      ]);
      const heading = founders().querySelector('h2')!;
      expect(text(heading)).toBe('Slovo zakladatelů');
      expect(heading.classList).toContain('visually-hidden');
    });

    it('then each signature stands under the quote with the portrait, the name and the role of who signed it', () => {
      const signers = Array.from(founders().querySelectorAll('.signer'));
      expect(
        signers.map((signer) => [
          text(signer.querySelector('.signer-name')),
          text(signer.querySelector('.signer-role')),
        ]),
      ).toEqual([['Eva Vzorová', 'Zakladatelka a předsedkyně správní rady']]);
      const [ink, portrait] = Array.from(signers[0].querySelectorAll('img'));
      expect(ink.getAttribute('src')).toBe(`/api/content/media/${SIGNATURE_ID}?w=480`);
      expect(ink.getAttribute('alt')).toBe('');
      expect(ink.getAttribute('width')).toBe('600');
      expect(ink.getAttribute('height')).toBe('180');
      expect(ink.classList).toContain('ui-ink');
      expect(portrait.getAttribute('src')).toBe(`/api/content/media/${PORTRAIT_ID}?w=480`);
      expect(portrait.getAttribute('alt')).toBe('');
    });

    it('then the board line names every member with no-break spaces inside the names and the notes in parentheses, and the line under the board follows it', () => {
      const line = founders().querySelector('.board-members')!;
      const footnote = founders().querySelector('.board-footnote')!;

      expect(line.textContent).toBe(
        'Správní rada: Eva Vzorová (předsedkyně), Adam Vzor, Hana Vzorová.',
      );
      expect(text(footnote)).toBe('Web zajišťuje bez nároku na odměnu Petr Vzor.');
      expect(
        line.compareDocumentPosition(footnote) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('and the note has no signature yet, then the featured people stand under the quote instead, a card without a portrait with the initials', async () => {
      const people = publicPeople();
      fixture.componentRef.setInput(
        'people',
        publicPeople({ note: { text: people.note!.text, signatures: [] } }),
      );
      await fixture.whenStable();

      expect(Array.from(founders().querySelectorAll('.signer-name')).map(text)).toEqual([
        'Eva Vzorová',
        'Adam Vzor',
      ]);
      const initials = founders().querySelectorAll('.signer')[1].querySelector('.signer-photo')!;
      expect(initials.getAttribute('aria-hidden')).toBe('true');
      expect(text(initials)).toBe('AV');
    });

    it('and there is no note, then the featured people stand under the heading of who runs the fund', async () => {
      fixture.componentRef.setInput('people', publicPeople({ note: null }));
      await fixture.whenStable();

      expect(founders().querySelector('blockquote')).toBeNull();
      expect(text(founders().querySelector('h2'))).toBe('Kdo fond vede');
      expect(founders().querySelectorAll('.signer').length).toBe(2);
    });

    it('and there is no note, nobody featured, nobody on the board and no line under it, then nothing of them shows', async () => {
      fixture.componentRef.setInput(
        'people',
        publicPeople({ featured: [], board: [], note: null, footnote: null }),
      );
      await fixture.whenStable();

      expect(founders().querySelector('h2')).toBeNull();
      expect(founders().querySelector('.signer')).toBeNull();
      expect(founders().querySelector('.board-members')).toBeNull();
      expect(founders().querySelector('.board-footnote')).toBeNull();
    });
  });
});
