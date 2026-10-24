import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProjectResponse } from '../../../projects-api';
import { ProjectCard } from './project-card';

@Component({
  selector: 'app-projects',
  imports: [RouterLink, ProjectCard],
  templateUrl: './projects.html',
  styleUrl: './projects.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Projects {
  readonly items = input<ProjectResponse[]>([]);
}
