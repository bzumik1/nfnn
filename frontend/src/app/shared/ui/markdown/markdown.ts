import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DOCUMENT, NgTemplateOutlet } from '@angular/common';
import { Router } from '@angular/router';
import { parseMarkdown } from './markdown-parser';

const SERVED_BY_THE_SERVER = /^\/api\/|\.[^/]*$/;

@Component({
  selector: 'app-markdown',
  imports: [NgTemplateOutlet],
  templateUrl: './markdown.html',
  styleUrl: './markdown.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Markdown {
  readonly text = input.required<string>();

  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);

  protected readonly blocks = computed(() => parseMarkdown(this.text()));

  protected follow(event: MouseEvent, href: string): void {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    const page = this.pageOfTheSite(href);
    if (page !== null) {
      event.preventDefault();
      void this.router.navigateByUrl(page);
    }
  }

  private pageOfTheSite(href: string): string | null {
    const here = new URL(this.document.baseURI);
    const target = new URL(href, here);
    if (target.origin !== here.origin || SERVED_BY_THE_SERVER.test(target.pathname)) {
      return null;
    }
    return `${target.pathname}${target.search}${target.hash}`;
  }
}
