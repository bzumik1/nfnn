import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FocalPointCrop } from '../../../shared/ui/focal-point/focal-point';
import { mediaUrl, SMALL_MEDIA_WIDTH } from '../news-api';
import { ProjectResponse } from '../projects-api';

export interface StoriesOfYear {
  year: number;
  projects: ProjectResponse[];
}

interface StoryTile {
  project: ProjectResponse;
  image: string | null;
}

@Component({
  selector: 'app-year-stories',
  imports: [RouterLink, FocalPointCrop],
  templateUrl: './year-stories.html',
  styleUrl: './year-stories.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class YearStories {
  readonly stories = input.required<StoriesOfYear>();

  protected readonly tiles = computed<StoryTile[]>(() =>
    this.stories().projects.map((project) => ({
      project,
      image: project.coverImage ? mediaUrl(project.coverImage.id, SMALL_MEDIA_WIDTH) : null,
    })),
  );
}

export function storiesOfNewestYear(projects: ProjectResponse[]): StoriesOfYear | null {
  if (projects.length === 0) {
    return null;
  }
  const year = Math.max(...projects.map((item) => item.year));
  return { year, projects: projects.filter((item) => item.year === year) };
}
