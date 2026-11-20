import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-quote-mark',
  templateUrl: './quote-mark.html',
  styleUrl: './quote-mark.scss',
  host: { 'aria-hidden': 'true' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuoteMark {}
