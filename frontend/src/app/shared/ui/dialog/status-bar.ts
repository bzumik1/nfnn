import { DOCUMENT, inject, InjectionToken } from '@angular/core';

export const STATUS_BAR_KEEPS_PAGE_COLOUR = new InjectionToken<boolean>(
  'STATUS_BAR_KEEPS_PAGE_COLOUR',
  {
    providedIn: 'root',
    factory: () =>
      inject(DOCUMENT).defaultView?.CSS?.supports?.('-webkit-touch-callout', 'none') === true,
  },
);
