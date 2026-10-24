import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { Markdown } from './markdown';

@Component({
  selector: 'app-markdown-preview',
  imports: [Markdown],
  templateUrl: './markdown-preview.html',
  styleUrl: './markdown-preview.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarkdownPreview {
  readonly text = input.required<string>();
  readonly previewId = input.required<string>();

  private readonly open = signal(false);
  readonly isOpen = this.open.asReadonly();
  protected readonly empty = computed(() => this.text().trim() === '');

  toggle(): void {
    this.open.update((open) => !open);
  }
}
