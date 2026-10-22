import { ChangeDetectionStrategy, Component, contentChild, input } from '@angular/core';
import { FormControlDirective } from './form-control';

export type FieldMessages = Readonly<Record<string, string>>;

@Component({
  selector: 'app-form-field',
  templateUrl: './form-field.html',
  styleUrl: './form-field.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormField {
  readonly label = input.required<string>();
  readonly hint = input('');
  readonly messages = input<FieldMessages>({});

  protected readonly control = contentChild.required(FormControlDirective);

  protected error(): string {
    const key = this.control().errorKey();
    return key === null ? '' : (this.messages()[key] ?? '');
  }
}
