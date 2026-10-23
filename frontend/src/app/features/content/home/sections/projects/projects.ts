import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ProjectResponse } from '../../../projects-api';
import { ProjectCard } from './project-card';

@Component({
  selector: 'app-projects',
  imports: [ProjectCard],
  templateUrl: './projects.html',
  styleUrl: './projects.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Projects {
  readonly items = input<ProjectResponse[]>([]);
}
