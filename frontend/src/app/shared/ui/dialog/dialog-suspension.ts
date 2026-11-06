import { Directive, inject, InjectionToken, input, Signal, signal } from '@angular/core';

export const DIALOG_SUSPENSION = new InjectionToken<Signal<boolean>>('DIALOG_SUSPENSION', {
  providedIn: 'root',
  factory: () => signal(false).asReadonly(),
});

@Directive({
  selector: '[appSuspendsDialogs]',
  providers: [{ provide: DIALOG_SUSPENSION, useFactory: () => inject(SuspendsDialogs).suspended }],
})
export class SuspendsDialogs {
  readonly suspended = input(false, { alias: 'appSuspendsDialogs' });
}
