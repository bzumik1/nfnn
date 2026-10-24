import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { newsArticle } from '../testing/news-fixtures';
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
});
