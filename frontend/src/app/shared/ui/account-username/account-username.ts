import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-account-username',
  template: `<input
    type="email"
    name="username"
    autocomplete="username"
    [value]="email()"
    hidden
    readonly
    tabindex="-1"
    aria-hidden="true"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountUsername {
  readonly email = input.required<string>();
}
