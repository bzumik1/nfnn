import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { draftArticle, IMAGE_ID, newsArticle } from '../../content/testing/news-fixtures';
import { project } from '../../content/testing/project-fixtures';
import { ContentPreview, PreviewContent } from './content-preview';

async function setUp(content: PreviewContent): Promise<ComponentFixture<ContentPreview>> {
  await TestBed.configureTestingModule({
    imports: [ContentPreview],
    providers: [provideRouter([])],
  }).compileComponents();
  const fixture = TestBed.createComponent(ContentPreview);
  fixture.componentRef.setInput('content', content);
  await fixture.whenStable();
  return fixture;
}

function text(fixture: ComponentFixture<unknown>, selector: string): string {
  return (fixture.nativeElement.querySelector(selector)?.textContent ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function texts(fixture: ComponentFixture<unknown>, selector: string): string[] {
  return Array.from(fixture.nativeElement.querySelectorAll(selector) as NodeListOf<Element>).map(
    (found) => (found.textContent ?? '').replace(/\s+/g, ' ').trim(),
  );
}

describe('Given the preview of a news article', () => {
  it('when it is shown, then the public card and the public page carry its texts, date and photo', async () => {
    const fixture = await setUp({ kind: 'news', item: newsArticle() });

    expect(texts(fixture, 'h2')).toEqual([
      'Karta na úvodní stránce a v seznamu aktualit',
      'Stránka aktuality',
    ]);
    expect(text(fixture, '.news-card .news-title')).toBe('Zahrada pro děti');
    expect(text(fixture, '.news-card .news-tag')).toBe('Projekt');
    expect(text(fixture, '.news-card .news-date')).toBe('20. 10. 2026');
    expect(text(fixture, '.news-card .news-perex')).toBe(newsArticle().perex);
    expect(
      (fixture.nativeElement.querySelector('.news-card img') as HTMLImageElement).getAttribute(
        'src',
      ),
    ).toBe(`/api/content/media/${IMAGE_ID}?w=480`);
    expect(text(fixture, 'app-content-article h3')).toBe('Zahrada pro děti');
    expect(text(fixture, 'app-content-article .ui-eyebrow')).toBe('Projekt · 20. 10. 2026');
    expect(texts(fixture, 'app-content-article .prose p')).toEqual([
      'První odstavec textu.',
      'Druhý odstavec textu.',
    ]);
    expect(fixture.nativeElement.querySelector('h1')).toBeNull();
    expect(fixture.nativeElement.querySelector('.news-card a')).toBeNull();
  });

  it('when it has no photo and no tag, then the card shows neither', async () => {
    const fixture = await setUp({
      kind: 'news',
      item: draftArticle({ publishedOn: '2026-10-24' }),
    });

    expect(fixture.nativeElement.querySelector('.news-card img')).toBeNull();
    expect(fixture.nativeElement.querySelector('.news-card .news-tag')).toBeNull();
    expect(text(fixture, '.news-card .news-date')).toBe('24. 10. 2026');
  });
});

describe('Given the preview of a project', () => {
  it('when it is shown, then the public project card and page carry its year', async () => {
    const fixture = await setUp({ kind: 'project', item: project() });

    expect(texts(fixture, 'h2')).toEqual([
      'Karta na úvodní stránce a v seznamu projektů',
      'Stránka projektu',
    ]);
    expect(text(fixture, '.card .card-year')).toBe('2024');
    expect(text(fixture, 'app-content-article .ui-eyebrow')).toBe('Projekt · 2024');
    expect(fixture.nativeElement.querySelector('.card a')).toBeNull();
  });
});
