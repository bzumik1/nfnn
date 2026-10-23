import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  viewChild,
} from '@angular/core';

@Component({
  selector: 'app-page-title',
  template: '<h1 #heading class="page-title" tabindex="-1"><ng-content /></h1>',
  styleUrl: './page-title.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageTitle {
  private readonly heading = viewChild.required<ElementRef<HTMLHeadingElement>>('heading');

  constructor() {
    afterNextRender(() => this.heading().nativeElement.focus());
  }
}
