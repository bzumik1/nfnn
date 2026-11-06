import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdminMore } from './admin-more';

describe('Given an administrator who opens the less frequent sections of the administration', () => {
  let fixture: ComponentFixture<AdminMore>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminMore],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(AdminMore);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  function clean(value: string | null | undefined): string {
    return (value ?? '').replace(/\s+/g, ' ').trim();
  }

  function groups(): { title: string; links: (string | null)[][] }[] {
    const nav: HTMLElement = fixture.nativeElement.querySelector('nav');
    return Array.from(nav.querySelectorAll('section')).map((section) => ({
      title: clean(
        fixture.nativeElement.querySelector(`#${section.getAttribute('aria-labelledby')}`)
          ?.textContent,
      ),
      links: Array.from(section.querySelectorAll('a')).map((link) => [
        clean(link.textContent),
        link.getAttribute('href'),
      ]),
    }));
  }

  it('when the page opens, then its heading names it and takes the focus', () => {
    const heading: HTMLElement = fixture.nativeElement.querySelector('h1');
    expect(clean(heading.textContent)).toBe('Občas a pro technika');
    expect(document.activeElement).toBe(heading);
  });

  it('when the page opens, then a navigation lists every section the overview leaves out, grouped as in the side panel', () => {
    expect(fixture.nativeElement.querySelector('nav').getAttribute('aria-label')).toBe(
      'Další sekce správy',
    );
    expect(groups()).toEqual([
      {
        title: 'Občas',
        links: [
          ['Hromadná potvrzení', '/sprava/hromadna-potvrzeni'],
          ['Fotka v sekci O nás', '/sprava/o-nas'],
          ['Fotka v pruhu Přispět', '/sprava/pruh-prispet'],
          ['Lidé fondu', '/sprava/lide-fondu'],
          ['Správci', '/sprava/spravci'],
          ['Měsíční e-mail', '/sprava/prehledy'],
          ['Zálohy', '/sprava/zalohy'],
          ['Upozornění na telefon', '/sprava/upozorneni'],
          ['Historie změn', '/sprava/historie'],
        ],
      },
      {
        title: 'Pro technika',
        links: [
          ['Nastavení', '/sprava/nastaveni'],
          ['Logy a diagnostika', '/sprava/logy'],
          ['Odpovědi o starších symbolech', '/sprava/starsi-symboly'],
        ],
      },
    ]);
  });
});
