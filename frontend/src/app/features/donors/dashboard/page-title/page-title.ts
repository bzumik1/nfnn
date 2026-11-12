import {
  afterNextRender,
  InjectionToken,
  inject,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  viewChild,
} from '@angular/core';

export const PAGE_IN_SHEET = new InjectionToken<boolean>('PAGE_IN_SHEET', {
  factory: () => false,
});

@Component({
  selector: 'app-page-title',
  template: `@if (!inSheet) {
    <h1 #heading class="page-title" tabindex="-1"><ng-content /></h1>
  }`,
  styleUrl: './page-title.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageTitle {
  protected readonly inSheet = inject(PAGE_IN_SHEET);
  private readonly heading = viewChild<ElementRef<HTMLHeadingElement>>('heading');

  constructor() {
    afterNextRender(() => this.heading()?.nativeElement.focus());
  }
}
