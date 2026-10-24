import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';

export const NOT_FOUND_TITLE = $localize`:@@content.notFound.pageTitle:Stránka nenalezena | Nová naděje – nadační fond`;

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  templateUrl: './not-found.html',
  styleUrl: './not-found.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFound implements OnInit, OnDestroy {
  private readonly meta = inject(Meta);

  readonly missing = input<'news' | 'project' | null>(null);

  ngOnInit(): void {
    this.meta.updateTag({ name: 'robots', content: 'noindex' });
  }

  ngOnDestroy(): void {
    this.meta.removeTag('name="robots"');
  }
}
