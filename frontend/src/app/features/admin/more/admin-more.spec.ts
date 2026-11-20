import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { CompactLayout } from '../../../core/layout/compact-layout';
import { AdminMore } from './admin-more';
import { withOrdinarySpaces } from '../../../../testing/ordinary-spaces';

describe('Given an administrator who opens the less frequent sections of the administration', () => {
  let fixture: ComponentFixture<AdminMore>;
  const compact = signal(true);

  beforeEach(async () => {
    compact.set(true);
    await TestBed.configureTestingModule({
      imports: [AdminMore],
      providers: [
        provideRouter([]),
        { provide: CompactLayout, useValue: { isCompact: compact.asReadonly() } },
      ],
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
        withOrdinarySpaces(
          fixture.nativeElement.querySelector(`#${section.getAttribute('aria-labelledby')}`)
            ?.textContent,
        ),
      ),
      links: Array.from(section.querySelectorAll('a')).map((link) => [
        clean(withOrdinarySpaces(link.textContent)),
        link.getAttribute('href'),
      ]),
    }));
  }

  it('when the page opens, then its heading names it and takes the focus', () => {
    const heading: HTMLElement = fixture.nativeElement.querySelector('h1');
    expect(clean(withOrdinarySpaces(heading.textContent))).toBe('Občas a pro technika');
    expect(document.activeElement).toBe(heading);
  });

  it('when the page opens, then each group holds its own heading over one list of its sections', () => {
    const sections: HTMLElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('nav section'),
    );

    expect(sections.length).toBe(2);
    for (const section of sections) {
      const title = section.querySelector(`#${section.getAttribute('aria-labelledby')}`);
      expect(title?.tagName).toBe('H2');
      expect(section.querySelectorAll('ul').length).toBe(1);
    }
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
          ['Ověřit potvrzení', '/sprava/overit'],
          ['Fotka v sekci O nás', '/sprava/o-nas'],
          ['Fotka v pruhu Přispět', '/sprava/pruh-prispet'],
          ['Lidé fondu', '/sprava/lide-fondu'],
          ['Správci', '/sprava/spravci'],
          ['Měsíční e-mail', '/sprava/prehledy'],
          ['Zálohy', '/sprava/zalohy'],
          ['Upozornění', '/sprava/upozorneni'],
          ['Historie změn', '/sprava/historie'],
        ],
      },
      {
        title: 'Pro technika',
        links: [
          ['Nastavení', '/sprava/nastaveni'],
          ['Logy a diagnostika', '/sprava/logy'],
          ['Odpovědi o starších symbolech', '/sprava/starsi-symboly'],
          ['Loga bank', '/sprava/loga-bank'],
        ],
      },
    ]);
  });

  it('when the window widens to a computer, then the overview takes its place, since the side navigation lists every section', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    compact.set(false);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(navigate).toHaveBeenCalledWith('/sprava', { replaceUrl: true });
  });

  it('when the window stays a phone, then the page stays', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    fixture.detectChanges();
    await fixture.whenStable();

    expect(navigate).not.toHaveBeenCalled();
  });
});
