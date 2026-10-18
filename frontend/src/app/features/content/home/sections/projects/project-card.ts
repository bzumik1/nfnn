import { Component, computed, input } from '@angular/core';

export type ProjectKey = 'dominik' | 'anicka' | 'tomas' | 'eliska' | 'martin';

@Component({
  selector: 'app-project-card',
  templateUrl: './project-card.html',
  styleUrl: './project-card.scss',
})
export class ProjectCard {
  readonly project = input.required<ProjectKey>();

  protected readonly imageSrc = computed(() => {
    const map: Record<ProjectKey, string> = {
      dominik: '/images/project-1.webp',
      anicka: '/images/project-2.webp',
      tomas: '/images/project-3.webp',
      eliska: '/images/project-4.webp',
      martin: '/images/project-5.webp',
    };
    return map[this.project()];
  });
}
