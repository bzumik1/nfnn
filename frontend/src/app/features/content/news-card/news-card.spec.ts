import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { IMAGE_ID, newsArticle } from '../testing/news-fixtures';
import { NewsCard } from './news-card';

async function setUp(): Promise<ComponentFixture<NewsCard>> {
  await TestBed.configureTestingModule({
    imports: [NewsCard],
    providers: [provideRouter([])],
  }).compileComponents();
  const fixture = TestBed.createComponent(NewsCard);
  fixture.componentRef.setInput('item', newsArticle());
  return fixture;
}

describe('Given the card of a news article', () => {
  it('when it is shown on the site, then its title leads to the article', async () => {
    const fixture = await setUp();
    await fixture.whenStable();

    const link = fixture.nativeElement.querySelector('.news-title a') as HTMLAnchorElement;
    expect(link.textContent?.trim()).toBe('Zahrada pro děti');
    expect(link.getAttribute('href')).toBe('/aktuality/zahrada-pro-deti');
  });

  it('when it is shown without a link, then the title is plain text and nothing leads away', async () => {
    const fixture = await setUp();
    fixture.componentRef.setInput('linked', false);
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('a')).toBeNull();
    expect(fixture.nativeElement.querySelector('.news-title')?.textContent?.trim()).toBe(
      'Zahrada pro děti',
    );
    expect(fixture.nativeElement.querySelector('.news-date')?.textContent?.trim()).toBe(
      '20. 10. 2026',
    );
  });

  it('when it is shown, then the tag, the date and the perex stand beside a decorative photo that waits until it is near', async () => {
    const fixture = await setUp();
    await fixture.whenStable();
    const card = fixture.nativeElement as HTMLElement;

    expect(card.querySelector('.news-tag')?.textContent).toBe('Projekt');
    expect(card.querySelector('.news-date')?.textContent).toBe('20. 10. 2026');
    expect(card.querySelector('.news-perex')?.textContent).toBe(newsArticle().perex);
    const image = card.querySelector('img') as HTMLImageElement;
    expect(image.getAttribute('src')).toBe(`/api/content/media/${IMAGE_ID}?w=480`);
    expect(image.getAttribute('srcset')).toContain(`/api/content/media/${IMAGE_ID}?w=960 960w`);
    expect(image.getAttribute('loading')).toBe('lazy');
    expect(image.getAttribute('alt')).toBe('');
  });

  it('when the article has no photo and no tag, then the card shows neither', async () => {
    const fixture = await setUp();
    fixture.componentRef.setInput('item', newsArticle({ tag: null, coverImage: null }));
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(fixture.nativeElement.querySelector('.news-tag')).toBeNull();
  });
});

describe('Given the card of a signed news article', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'share', {
      value: () => Promise.resolve(),
      configurable: true,
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'share');
  });

  const signed = newsArticle({
    signer: {
      id: 'p1',
      name: 'Pavel Vzorový',
      role: 'Předseda správní rady',
      portrait: { id: 'portrait-1', url: '/api/content/media/portrait-1', width: 600, height: 600 },
    },
  });

  it('when it is shown on the site, then the signer stands under the perex and Sdílet names the article', async () => {
    const fixture = await setUp();
    fixture.componentRef.setInput('item', signed);
    await fixture.whenStable();
    const card = fixture.nativeElement as HTMLElement;

    expect(card.querySelector('.signer-name')?.textContent?.trim()).toBe('Pavel Vzorový');
    expect(card.querySelector('.signer-role')?.textContent?.trim()).toBe('Předseda správní rady');
    expect(
      [...card.querySelectorAll('button')].map((button) =>
        button.textContent?.replace(/\s+/g, ' ').trim(),
      ),
    ).toEqual(['Sdílet Zahrada pro děti']);
  });

  it('when it is previewed in the administration, then the signer shows and nothing can be shared', async () => {
    const fixture = await setUp();
    fixture.componentRef.setInput('item', signed);
    fixture.componentRef.setInput('linked', false);
    await fixture.whenStable();
    const card = fixture.nativeElement as HTMLElement;

    expect(card.querySelector('.signer-name')?.textContent?.trim()).toBe('Pavel Vzorový');
    expect(card.querySelector('button')).toBeNull();
  });
});
