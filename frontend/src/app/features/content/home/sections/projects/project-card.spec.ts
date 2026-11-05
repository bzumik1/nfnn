import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { IMAGE_ID, project } from '../../../testing/project-fixtures';
import { ProjectCard } from './project-card';

async function setUp(): Promise<ComponentFixture<ProjectCard>> {
  await TestBed.configureTestingModule({
    imports: [ProjectCard],
    providers: [provideRouter([])],
  }).compileComponents();
  const fixture = TestBed.createComponent(ProjectCard);
  fixture.componentRef.setInput('item', project());
  return fixture;
}

describe('Given the card of a project', () => {
  it('when it is shown on the site, then its title leads to the project', async () => {
    const fixture = await setUp();
    await fixture.whenStable();

    const link = fixture.nativeElement.querySelector('.card-title a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/projekty/zahrada-pro-deti');
  });

  it('when it is shown without a link, then the title is plain text and nothing leads away', async () => {
    const fixture = await setUp();
    fixture.componentRef.setInput('linked', false);
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('a')).toBeNull();
    expect(fixture.nativeElement.querySelector('.card-title')?.textContent?.trim()).toBe(
      'Zahrada pro děti',
    );
    expect(fixture.nativeElement.querySelector('.card-year')?.textContent?.trim()).toBe('2024');
  });

  it('when it is shown, then the tag, the year and the perex stand beside a decorative photo that waits until it is near', async () => {
    const fixture = await setUp();
    await fixture.whenStable();
    const card = fixture.nativeElement as HTMLElement;

    expect(card.querySelector('.card-tag')?.textContent).toBe('Projekt');
    expect(card.querySelector('.card-year')?.textContent).toBe('2024');
    expect(card.querySelector('.card-desc')?.textContent).toBe(project().perex);
    const image = card.querySelector('img') as HTMLImageElement;
    expect(image.getAttribute('src')).toBe(`/api/content/media/${IMAGE_ID}?w=480`);
    expect(image.getAttribute('srcset')).toContain(`/api/content/media/${IMAGE_ID}?w=960 960w`);
    expect(image.getAttribute('loading')).toBe('lazy');
    expect(image.getAttribute('alt')).toBe('');
    const more = card.querySelector('.card-more');
    expect(more?.textContent?.trim()).toBe('Celý příběh →');
    expect(more?.getAttribute('aria-hidden')).toBe('true');
  });

  it('when the project has no photo and no tag, then the card shows neither', async () => {
    const fixture = await setUp();
    fixture.componentRef.setInput('item', project({ tag: null, coverImage: null }));
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(fixture.nativeElement.querySelector('.card-tag')).toBeNull();
  });
});
