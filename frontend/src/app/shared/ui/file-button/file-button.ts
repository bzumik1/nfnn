import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-file-button',
  templateUrl: './file-button.html',
  styleUrl: './file-button.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FileButton {
  readonly inputId = input.required<string>();
  readonly accept = input('');
  readonly describedBy = input<string | null>(null);
  readonly disabled = input(false);
  readonly chosen = output<File>();

  protected choose(event: Event): void {
    const field = event.target as HTMLInputElement;
    const file = field.files?.[0];
    field.value = '';
    if (file) {
      this.chosen.emit(file);
    }
  }
}
