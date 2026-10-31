import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { draftProject, IMAGE_ID, project } from '../../../testing/project-fixtures';
import { Projects } from './projects';

describe('Given the projects section', () => {
  let fixture: ComponentFixture<Projects>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Projects],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(Projects);
    fixture.detectChanges();
  });

  const root = () => fixture.nativeElement as HTMLElement;

  it('when it renders, then every child has a plain card that offers nothing to click', () => {
    const cards = Array.from(root().querySelectorAll('app-project-card article'));

    expect(cards).toHaveLength(3);
    for (const card of cards) {
      expect(card.getAttribute('role')).toBeNull();
      expect(card.getAttribute('tabindex')).toBeNull();
    }
    expect(root().querySelector('.card-toggle')).toBeNull();
    expect(root().textContent).not.toContain('Kliknutím na kartu');
  });

  it('when only the placeholder cards show, then no link offers a list of projects that does not exist yet', () => {
    expect(root().querySelector('a.all-link')).toBeNull();
  });

  it('when only the placeholder cards show, then the lead calls them examples rather than real stories', () => {
    expect(root().querySelector('.lead')?.textContent?.trim()).toBe('Příklady, jak pomáháme.');
  });

  it('when only the placeholder cards show, then no card invites the visitor to read on', () => {
    expect(root().querySelector('.card-more')).toBeNull();
  });

  it('when it renders, then the photos are decorative and the card titles name the children', () => {
    const alts = Array.from(root().querySelectorAll('img')).map((image) =>
      image.getAttribute('alt'),
    );

    expect(alts).toEqual(['', '', '']);
    expect(
      Array.from(root().querySelectorAll('.card-title')).map((title) => title.textContent?.trim()),
    ).toEqual(['Dominik, 7 let', 'Anička, 5 let', 'Tomáš, 9 let']);
  });

  it('when it renders, then the photos are small WebP files that wait until they are near', () => {
    const images = Array.from(root().querySelectorAll('img'));

    expect(images.map((image) => image.getAttribute('src'))).toEqual([
      '/images/project-1.webp',
      '/images/project-2.webp',
      '/images/project-3.webp',
    ]);
    for (const image of images) {
      expect(image.getAttribute('loading')).toBe('lazy');
      expect(image.getAttribute('width')).toBe('600');
      expect(image.getAttribute('height')).toBe('400');
    }
  });
});

describe('Given the projects section with published projects', () => {
  it('when the projects arrive, then each card shows the tag, the year, the perex and a link to the project', async () => {
    await TestBed.configureTestingModule({
      imports: [Projects],
      providers: [provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(Projects);
    fixture.componentRef.setInput('items', [
      project(),
      draftProject({ publishedOn: '2026-10-01' }),
    ]);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    const cards = Array.from(root.querySelectorAll('app-project-card article'));
    expect(cards).toHaveLength(2);
    expect(cards[0].querySelector('.card-tag')?.textContent).toBe('Projekt');
    expect(cards[0].querySelector('.card-year')?.textContent).toBe('2024');
    expect(cards[0].querySelector('.card-desc')?.textContent).toBe(project().perex);
    const link = cards[0].querySelector('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/projekty/zahrada-pro-deti');
    expect(link.textContent).toBe('Zahrada pro děti');
    const image = cards[0].querySelector('img') as HTMLImageElement;
    expect(image.getAttribute('src')).toBe(`/api/content/media/${IMAGE_ID}?w=480`);
    expect(image.getAttribute('loading')).toBe('lazy');
    expect(image.getAttribute('alt')).toBe('');
    expect(cards[1].querySelector('img')).toBeNull();
    expect(cards[1].querySelector('.card-tag')).toBeNull();
    expect(cards[1].querySelector('.card-year')?.textContent).toBe('2026');
    expect(root.textContent).not.toContain('Dominik, 7 let');
    const all = root.querySelector('a.all-link') as HTMLAnchorElement;
    expect(all.getAttribute('href')).toBe('/projekty');
    expect(all.textContent?.trim()).toBe('Kde všude pomáháme');
    expect(root.querySelector('.lead')?.textContent?.trim()).toBe(
      'Každý projekt je skutečný příběh skutečného dítěte.',
    );
    const more = cards[0].querySelector('.card-more');
    expect(more?.textContent?.trim()).toBe('Celý příběh →');
    expect(more?.getAttribute('aria-hidden')).toBe('true');
  });
});
