/// <reference types="@angular/localize" />

import {
  AfterContentInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
} from '@angular/core';

@Component({
  selector: 'app-password-reveal',
  templateUrl: './password-reveal.html',
  styleUrl: './password-reveal.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PasswordReveal implements AfterContentInit {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private input: HTMLInputElement | null = null;

  protected readonly shown = signal(false);
  protected readonly inputId = signal('');
  protected readonly label = $localize`:@@ui.password.reveal:Zobrazit heslo`;

  ngAfterContentInit(): void {
    this.input = this.host.querySelector('input');
    this.inputId.set(this.input?.id ?? '');
  }

  toggle(): void {
    this.shown.update((shown) => !shown);
    if (this.input) {
      this.input.type = this.shown() ? 'text' : 'password';
    }
  }
}
