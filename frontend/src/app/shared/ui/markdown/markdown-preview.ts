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

  protected readonly open = signal(false);
  protected readonly empty = computed(() => this.text().trim() === '');

  protected toggle(): void {
    this.open.update((open) => !open);
  }
}
