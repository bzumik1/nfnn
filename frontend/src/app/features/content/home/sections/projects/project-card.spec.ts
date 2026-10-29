import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { project } from '../../../testing/project-fixtures';
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
});
