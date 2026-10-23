import { ChangeDetectionStrategy, Component, ElementRef, inject, viewChild } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SiteHeader } from '../site-header/site-header';
import { SiteFooter } from '../site-footer/site-footer';
import { SetupRedirect } from '../../features/operations/setup/setup-redirect';

@Component({
  selector: 'app-public-shell',
  imports: [RouterOutlet, SiteHeader, SiteFooter],
  templateUrl: './public-shell.html',
  styleUrl: './public-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicShell {
  private readonly content = viewChild.required<ElementRef<HTMLElement>>('content');

  constructor() {
    inject(SetupRedirect).checkOnce();
  }

  skipToContent(event: Event): void {
    event.preventDefault();
    this.content().nativeElement.focus();
  }
}
