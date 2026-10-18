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
      dominik: '/images/proj1.jpg',
      anicka: '/images/proj2.jpg',
      tomas: '/images/proj3.jpg',
      eliska: '/images/proj4.jpg',
      martin: '/images/proj5.jpg',
    };
    return map[this.project()];
  });
}
