import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-avatar',
  templateUrl: './avatar.html',
  styleUrl: './avatar.scss',
  host: { 'aria-hidden': 'true' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Avatar {
  readonly name = input.required<string>();
  readonly src = input<string | null>(null);
  readonly srcset = input<string | null>(null);
  readonly sizes = input<string | null>(null);
  readonly size = input.required<number>();
  readonly loading = input<'lazy' | null>(null);

  protected readonly initials = computed(() =>
    this.name()
      .split(/\s+/)
      .filter((part) => part !== '')
      .map((part) => part.charAt(0).toLocaleUpperCase('cs'))
      .slice(0, 2)
      .join(''),
  );
}
