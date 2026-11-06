import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { project } from '../testing/project-fixtures';
import { StoriesOfYear, YearStories } from './year-stories';

@Component({
  imports: [YearStories],
  template: `
    <app-year-stories [stories]="newer" />
    <app-year-stories [stories]="older" />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class TwoYears {
  readonly newer: StoriesOfYear = {
    year: 2025,
    projects: [project({ id: 'sofinka', slug: 'sofinka', year: 2025, title: 'Sofinka' })],
  };
  readonly older: StoriesOfYear = {
    year: 2024,
    projects: [project({ id: 'miki', slug: 'miki', year: 2024, title: 'Miki' })],
  };
}

describe('Given the stories of two years on one page', () => {
  it('when both are shown, then each section is named by its own heading', async () => {
    await TestBed.configureTestingModule({
      imports: [TwoYears],
      providers: [provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(TwoYears);
    fixture.detectChanges();
    await fixture.whenStable();

    const root: HTMLElement = fixture.nativeElement;
    const names = Array.from(root.querySelectorAll('section')).map((section) => {
      const heading = root.querySelector(`[id="${section.getAttribute('aria-labelledby')}"]`);
      return heading?.textContent?.trim() ?? '';
    });
    expect(names).toEqual(['Příběhy z roku 2025', 'Příběhy z roku 2024']);
  });
});
