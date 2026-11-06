import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CONTACT_END_IN_VIEW, FoundationLinks } from './foundation-links';

describe('Given the links of the foundation at the end of O nás in the home-screen app', () => {
  let fixture: ComponentFixture<FoundationLinks>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FoundationLinks],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(FoundationLinks);
    fixture.detectChanges();
  });

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('when it shows, then it is a named list of rows with the privacy policy and the foundation’s e-mail', () => {
    const nav = root().querySelector('nav');
    const rows = Array.from(nav?.querySelectorAll<HTMLAnchorElement>('.ui-list a') ?? []);

    expect(nav?.getAttribute('aria-label')).toBe('O nadačním fondu');
    expect(rows.map((row) => row.textContent?.trim())).toEqual([
      'Zásady ochrany osobních údajů',
      'Napsat na info@nfnn.cz',
    ]);
    expect(rows[0].getAttribute('href')).toBe('/zasady-ochrany-osobnich-udaju');
    expect(rows[1].getAttribute('href')).toBe('mailto:info@nfnn.cz');
  });

  it('when it shows, then the note under the rows names the foundation, its IČO and its entry in the register', () => {
    const note = root().querySelector('nav + p')?.textContent?.replace(/\s+/g, ' ').trim();

    expect(note).toBe(
      `© ${new Date().getFullYear()} Nová naděje – nadační fond · IČO 27278794 · zapsán u KS Ústí nad Labem, oddíl N, vložka 78`,
    );
  });

  describe('when the page scrolls it into view', () => {
    type Watch = (entries: { isIntersecting: boolean }[]) => void;
    let watch: Watch | null;
    let watched: Element | null;

    beforeEach(() => {
      watch = null;
      watched = null;
      vi.stubGlobal(
        'IntersectionObserver',
        class {
          constructor(callback: Watch) {
            watch = callback;
          }

          observe(element: Element): void {
            watched = element;
          }

          disconnect(): void {
            return;
          }
        },
      );
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      document.documentElement.classList.remove(CONTACT_END_IN_VIEW);
    });

    it('then the page says so, so the room under the last rows and the screen pulled past its end keep the colour of the contact section', async () => {
      const links = TestBed.createComponent(FoundationLinks);
      links.detectChanges();
      await links.whenStable();

      expect(watched).toBe(links.nativeElement);
      watch!([{ isIntersecting: true }]);

      expect(document.documentElement.classList.contains(CONTACT_END_IN_VIEW)).toBe(true);
    });
  });
});
