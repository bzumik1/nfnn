import { InjectionToken } from '@angular/core';

export type DialogLook = 'centered' | 'sheet' | 'full';

export type DialogPresentation = 'auto' | DialogLook | 'viewer';

export const DIALOG_PRESENTATION = new InjectionToken<DialogLook>('DIALOG_PRESENTATION', {
  providedIn: 'root',
  factory: () => 'centered',
});
