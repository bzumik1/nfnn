import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { IMAGE_ID, newsArticle } from '../testing/news-fixtures';
import { project } from '../testing/project-fixtures';
import { ContentArticle } from './content-article';
import { newsPage, projectPage } from './content-page';

async function setUp(): Promise<ComponentFixture<ContentArticle>> {
  await TestBed.configureTestingModule({
    imports: [ContentArticle],
    providers: [provideRouter([])],
  }).compileComponents();
  return TestBed.createComponent(ContentArticle);
}

function text(fixture: ComponentFixture<unknown>, selector: string): string {
  return (fixture.nativeElement.querySelector(selector)?.textContent ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('Given the page of a news article', () => {
  let fixture: ComponentFixture<ContentArticle>;

  beforeEach(async () => {
    fixture = await setUp();
    fixture.componentRef.setInput('kind', 'news');
    fixture.componentRef.setInput('page', newsPage(newsArticle()));
  });

  it('when it is shown on the site, then the title is the page heading and the article leads back to the news', async () => {
    await fixture.whenStable();

    expect(text(fixture, 'h1')).toBe('Zahrada pro děti');
    expect(text(fixture, '.ui-eyebrow')).toBe('Projekt · 20. 10. 2026');
    expect(text(fixture, '.crumbs a')).toBe('← Všechny aktuality');
    expect(
      (fixture.nativeElement.querySelector('.photo img') as HTMLImageElement).getAttribute('src'),
    ).toBe(`/api/content/media/${IMAGE_ID}?w=960`);
  });

  it('when it is shown as a preview inside another page, then the title is a third-level heading and the page keeps its one h1', async () => {
    fixture.componentRef.setInput('preview', true);
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('h1')).toBeNull();
    expect(text(fixture, 'h3.ui-intro__title')).toBe('Zahrada pro děti');
    expect(text(fixture, '.ui-intro__lead')).toBe(newsArticle().perex);
  });
});

describe('Given the page of a news article signed by a person of the foundation', () => {
  const PORTRAIT = '0199f3e0-0000-7000-8000-00000000c101';

  async function shown(
    role: string | null,
    portrait: boolean,
  ): Promise<ComponentFixture<ContentArticle>> {
    const fixture = await setUp();
    fixture.componentRef.setInput('kind', 'news');
    fixture.componentRef.setInput(
      'page',
      newsPage(
        newsArticle({
          signer: {
            id: '0199f3e0-0000-7000-8000-00000000c001',
            name: 'Pavel Vzorový',
            role,
            portrait: portrait
              ? { id: PORTRAIT, url: `/api/content/media/${PORTRAIT}`, width: 640, height: 640 }
              : null,
          },
        }),
      ),
    );
    await fixture.whenStable();
    return fixture;
  }

  it('when it is shown, then the portrait, the name and the role stand under the text', async () => {
    const fixture = await shown('Předseda správní rady', true);

    expect(text(fixture, '.signer-name')).toBe('Pavel Vzorový');
    expect(text(fixture, '.signer-role')).toBe('Předseda správní rady');
    expect(
      (fixture.nativeElement.querySelector('.signer img') as HTMLImageElement).getAttribute('src'),
    ).toBe(`/api/content/media/${PORTRAIT}?w=480`);
    expect(fixture.nativeElement.querySelector('.prose + .signer')).not.toBeNull();
  });

  it('when the person has no portrait and no role, then their initials and name stand there alone', async () => {
    const fixture = await shown(null, false);

    expect(text(fixture, '.signer-name')).toBe('Pavel Vzorový');
    expect(fixture.nativeElement.querySelector('.signer-role')).toBeNull();
    expect(text(fixture, '.signer app-avatar')).toBe('PV');
  });
});

describe('Given the page of an unsigned news article', () => {
  it('when it is shown, then nothing stands under the text', async () => {
    const fixture = await setUp();
    fixture.componentRef.setInput('kind', 'news');
    fixture.componentRef.setInput('page', newsPage(newsArticle()));
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('.signer')).toBeNull();
  });
});

describe('Given the page of a project', () => {
  it('when it is shown, then the eyebrow carries the tag and the year and the article leads back to the projects', async () => {
    const fixture = await setUp();
    fixture.componentRef.setInput('kind', 'project');
    fixture.componentRef.setInput('page', projectPage(project()));
    await fixture.whenStable();

    expect(text(fixture, '.ui-eyebrow')).toBe('Projekt · 2024');
    expect(text(fixture, '.crumbs a')).toBe('← Kde pomáháme');
  });
});
