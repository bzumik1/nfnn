/// <reference types="@angular/localize" />

import { ChangeDetectionStrategy, Component, input } from '@angular/core';

const BOLD_PLACEHOLDER = $localize`:@@ui.markdown.bold.placeholder:tučný text`;
const ITALIC_PLACEHOLDER = $localize`:@@ui.markdown.italic.placeholder:text kurzívou`;
const LINK_PLACEHOLDER = $localize`:@@ui.markdown.link.placeholder:text odkazu`;
const LINK_ADDRESS = 'https://';

@Component({
  selector: 'app-markdown-toolbar',
  templateUrl: './markdown-toolbar.html',
  styleUrl: './markdown-toolbar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarkdownToolbar {
  readonly target = input.required<HTMLTextAreaElement>();

  protected bold(): void {
    this.wrap('**', BOLD_PLACEHOLDER);
  }

  protected italic(): void {
    this.wrap('*', ITALIC_PLACEHOLDER);
  }

  protected heading(): void {
    this.prefixLines(() => '## ');
  }

  protected bullets(): void {
    this.prefixLines(() => '- ');
  }

  protected numbers(): void {
    this.prefixLines((index) => `${index + 1}. `);
  }

  protected link(): void {
    const { value, selectionStart, selectionEnd } = this.target();
    const label = value.slice(selectionStart, selectionEnd) || LINK_PLACEHOLDER;
    const inserted = `[${label}](${LINK_ADDRESS})`;
    const addressStart = selectionStart + label.length + 3;
    this.apply(
      value.slice(0, selectionStart) + inserted + value.slice(selectionEnd),
      addressStart,
      addressStart + LINK_ADDRESS.length,
    );
  }

  private wrap(marker: string, placeholder: string): void {
    const { value, selectionStart, selectionEnd } = this.target();
    const chosen = value.slice(selectionStart, selectionEnd) || placeholder;
    const start = selectionStart + marker.length;
    this.apply(
      value.slice(0, selectionStart) + marker + chosen + marker + value.slice(selectionEnd),
      start,
      start + chosen.length,
    );
  }

  private prefixLines(prefix: (index: number) => string): void {
    const { value, selectionStart, selectionEnd } = this.target();
    const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
    const lastSelected =
      selectionEnd > selectionStart && value[selectionEnd - 1] === '\n'
        ? selectionEnd - 1
        : selectionEnd;
    const nextBreak = value.indexOf('\n', lastSelected);
    const lineEnd = nextBreak < 0 ? value.length : nextBreak;
    const lines = value
      .slice(lineStart, lineEnd)
      .split('\n')
      .map((line, index) => prefix(index) + line)
      .join('\n');
    this.apply(
      value.slice(0, lineStart) + lines + value.slice(lineEnd),
      lineStart,
      lineStart + lines.length,
    );
  }

  private apply(value: string, selectionStart: number, selectionEnd: number): void {
    const area = this.target();
    area.value = value;
    area.focus();
    area.setSelectionRange(selectionStart, selectionEnd);
    area.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
