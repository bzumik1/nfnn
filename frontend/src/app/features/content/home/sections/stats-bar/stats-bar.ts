import { ChangeDetectionStrategy, Component } from '@angular/core';

const FOUNDED = { year: 2005, monthIndex: 9, day: 28 };

@Component({
  selector: 'app-stats-bar',
  templateUrl: './stats-bar.html',
  styleUrl: './stats-bar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatsBar {
  protected readonly foundedYear = FOUNDED.year;
  protected readonly yearsHelping = fullYearsSinceFounding(new Date());
}

function fullYearsSinceFounding(today: Date): number {
  const anniversaryPassed =
    today.getMonth() > FOUNDED.monthIndex ||
    (today.getMonth() === FOUNDED.monthIndex && today.getDate() >= FOUNDED.day);
  return today.getFullYear() - FOUNDED.year - (anniversaryPassed ? 0 : 1);
}
