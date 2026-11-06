import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { markInView } from '../../../../layout/site-footer/footer-in-view';

export const CONTACT_END_IN_VIEW = 'contact-end-in-view';

@Component({
  selector: 'app-foundation-links',
  imports: [RouterLink],
  templateUrl: './foundation-links.html',
  styleUrl: './foundation-links.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FoundationLinks {
  protected readonly year = new Date().getFullYear();

  constructor() {
    markInView(CONTACT_END_IN_VIEW);
  }
}
