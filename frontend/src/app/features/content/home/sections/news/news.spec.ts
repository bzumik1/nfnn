import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { IMAGE_ID, newsArticle } from '../../../testing/news-fixtures';
import { News } from './news';

describe('Given the news section', () => {
  let fixture: ComponentFixture<News>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [News],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(News);
    fixture.detectChanges();
  });

  const root = () => fixture.nativeElement as HTMLElement;

  it('when it renders, then no link leads nowhere', () => {
    expect(root().querySelector('a[href="#"]')).toBeNull();
  });

  it('when only the placeholder cards show, then no link offers a list of articles that does not exist yet', () => {
    expect(root().querySelector('a.all-link')).toBeNull();
  });

  it('when it renders, then the photos are decorative because each title follows them', () => {
    const alts = Array.from(root().querySelectorAll('img')).map((image) =>
      image.getAttribute('alt'),
    );

    expect(alts.length).toBeGreaterThan(0);
    expect(alts.every((alt) => alt === '')).toBe(true);
  });

  it('when it renders, then the photos are small WebP files that wait until they are near', () => {
    const images = Array.from(root().querySelectorAll('img'));

    for (const image of images) {
      expect(image.getAttribute('src')).toMatch(/^\/images\/news-\d\.webp$/);
      expect(image.getAttribute('loading')).toBe('lazy');
      expect(image.getAttribute('width')).toBe('600');
      expect(image.getAttribute('height')).toBe('400');
    }
  });
});

describe('Given the news section with published articles', () => {
  it('when the articles arrive, then each card shows the tag, the date, the perex and a link to the article', async () => {
    await TestBed.configureTestingModule({
      imports: [News],
      providers: [provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(News);
    fixture.componentRef.setInput('items', [
      newsArticle(),
      newsArticle({ id: 'x', slug: 'bez-fotky', title: 'Bez fotky', tag: null, coverImage: null }),
    ]);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    const cards = Array.from(root.querySelectorAll('.news-card'));
    expect(cards).toHaveLength(2);
    expect(cards[0].querySelector('.news-tag')?.textContent).toBe('Projekt');
    expect(cards[0].querySelector('.news-date')?.textContent).toBe('20. 10. 2026');
    expect(cards[0].querySelector('.news-perex')?.textContent).toBe(newsArticle().perex);
    const link = cards[0].querySelector('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/aktuality/zahrada-pro-deti');
    expect(link.textContent).toBe('Zahrada pro děti');
    const image = cards[0].querySelector('img') as HTMLImageElement;
    expect(image.getAttribute('src')).toBe(`/api/content/media/${IMAGE_ID}?w=480`);
    expect(image.getAttribute('srcset')).toContain(`/api/content/media/${IMAGE_ID}?w=960 960w`);
    expect(image.getAttribute('loading')).toBe('lazy');
    expect(image.getAttribute('alt')).toBe('');
    expect(cards[1].querySelector('img')).toBeNull();
    expect(cards[1].querySelector('.news-tag')).toBeNull();
    expect(root.textContent).not.toContain('Dominikovi');
    const all = root.querySelector('a.all-link') as HTMLAnchorElement;
    expect(all.getAttribute('href')).toBe('/aktuality');
    expect(all.textContent?.trim()).toBe('Všechny aktuality');
  });
});
