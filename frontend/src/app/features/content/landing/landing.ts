import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Hero } from '../home/sections/hero/hero';

@Component({
  selector: 'app-landing',
  imports: [Hero],
  templateUrl: './landing.html',
  styleUrl: './landing.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Landing {}
