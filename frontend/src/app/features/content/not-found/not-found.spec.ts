import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Meta } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { NotFound } from './not-found';
import { withOrdinarySpaces } from '../../../../testing/ordinary-spaces';

describe('Given an address the site does not know', () => {
  let fixture: ComponentFixture<NotFound>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NotFound],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(NotFound);
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  it('when the page opens, then it says the page does not exist and leads home', () => {
    const root = fixture.nativeElement as HTMLElement;

    expect(withOrdinarySpaces(root.querySelector('h1')?.textContent)?.trim()).toBe(
      'Tuhle stránku jsme nenašli',
    );
    expect(root.querySelector('a')?.getAttribute('href')).toBe('/');
  });

  function links(selector: string): string[][] {
    const root = fixture.nativeElement as HTMLElement;
    return Array.from(root.querySelectorAll(`${selector} a`)).map((link) => [
      link.getAttribute('href') ?? '',
      withOrdinarySpaces(link.textContent)?.trim() ?? '',
    ]);
  }

  function lead(): string | undefined {
    const root = fixture.nativeElement as HTMLElement;
    return withOrdinarySpaces(root.querySelector('.ui-intro__lead')?.textContent)?.trim();
  }

  it('when the page opens for an unknown address, then it leads home and to the contact form, and quietly to the news and the projects', () => {
    expect(lead()).toBe(
      'Odkaz je možná starý nebo v adrese chybí písmenko. Zbytek webu je na svém místě.',
    );
    expect(links('.actions')).toEqual([
      ['/', 'Zpět na úvodní stránku'],
      ['/o-nas#kontakt', 'Napište nám'],
    ]);
    expect(links('.more')).toEqual([
      ['/aktuality', 'Všechny aktuality'],
      ['/projekty', 'Kde pomáháme'],
    ]);
  });

  it('when it stands for a news article that is gone, then it says so, leads to all the news first and quietly to the projects', () => {
    fixture.componentRef.setInput('missing', 'news');
    fixture.detectChanges();

    expect(lead()).toBe('Tahle aktualita už na webu není.');
    expect(links('.actions')).toEqual([
      ['/aktuality', 'Všechny aktuality'],
      ['/', 'Zpět na úvodní stránku'],
    ]);
    expect(links('.more')).toEqual([['/projekty', 'Kde pomáháme']]);
  });

  it('when it stands for a project that is gone, then it says so, leads to all the projects first and quietly to the news', () => {
    fixture.componentRef.setInput('missing', 'project');
    fixture.detectChanges();

    expect(lead()).toBe('Tenhle příběh už na webu není.');
    expect(links('.actions')).toEqual([
      ['/projekty', 'Kde pomáháme'],
      ['/', 'Zpět na úvodní stránku'],
    ]);
    expect(links('.more')).toEqual([['/aktuality', 'Všechny aktuality']]);
  });

  it.each([null, 'news', 'project'] as const)(
    'when it stands for %s, then the quiet line holds at most three links and repeats no action',
    (missing) => {
      fixture.componentRef.setInput('missing', missing);
      fixture.detectChanges();

      const actionTargets = links('.actions').map(([href]) => href);
      const quietTargets = links('.more').map(([href]) => href);
      expect(quietTargets.length).toBeLessThanOrEqual(3);
      expect(quietTargets.filter((href) => actionTargets.includes(href))).toEqual([]);
    },
  );

  it('when the page opens, then search engines are asked not to index it, and leaving it lifts that', () => {
    const meta = TestBed.inject(Meta);
    expect(meta.getTag('name="robots"')?.content).toBe('noindex');

    fixture.destroy();

    expect(meta.getTag('name="robots"')).toBeNull();
  });
});
