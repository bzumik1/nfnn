import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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

    it('then a heading under the founding story names it and the chairman follows with his role', () => {
      expect(text(board().querySelector('h3'))).toBe('Kdo fond vede');
      expect(text(board().querySelector('.board-chair'))).toBe(
        'Pavel Znamenáček, předseda správní rady',
      );
    });

    it('then the whole board and the auditor are listed as in the registry', () => {
      expect(Array.from(board().querySelectorAll('.board-members')).map(text)).toEqual([
        'Správní rada: Pavel Znamenáček (předseda), Andrea Znamenáčková, Zdeňka Znamenáčková. Každý člen jedná za fond samostatně.',
        'Revizor: Miroslav Hloucal.',
      ]);
    });

    it('then his portrait stays out of the screen reader, since his name is beside it, and loads late in two widths', () => {
      const portrait = board().querySelector('img')!;

      expect(portrait.getAttribute('alt')).toBe('');
      expect(portrait.getAttribute('loading')).toBe('lazy');
      expect(portrait.getAttribute('srcset')).toBe(
        '/images/pavel-znamenacek-160.webp 160w, /images/pavel-znamenacek-320.webp 320w',
      );
      expect(portrait.getAttribute('width')).toBe('160');
      expect(portrait.getAttribute('height')).toBe('160');
    });
  });
});
