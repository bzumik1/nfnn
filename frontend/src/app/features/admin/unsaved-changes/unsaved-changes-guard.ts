import { CanDeactivateFn } from '@angular/router';

export interface GuardsUnsavedChanges {
  canLeave(): boolean | Promise<boolean>;
}

export const unsavedChangesGuard: CanDeactivateFn<GuardsUnsavedChanges | null> = (component) =>
  component === null ? true : component.canLeave();
