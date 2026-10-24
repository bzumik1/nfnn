import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { parseMarkdown } from './markdown-parser';

@Component({
  selector: 'app-markdown',
  imports: [NgTemplateOutlet],
  templateUrl: './markdown.html',
  styleUrl: './markdown.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Markdown {
  readonly text = input.required<string>();

  protected readonly blocks = computed(() => parseMarkdown(this.text()));
}
