import { CanDeactivateFn } from '@angular/router';

export interface GuardsUnsavedChanges {
  canLeave(): boolean | Promise<boolean>;
}

export const unsavedChangesGuard: CanDeactivateFn<GuardsUnsavedChanges> = (component) =>
  component.canLeave();
