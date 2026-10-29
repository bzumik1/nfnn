/// <reference types="@angular/localize" />

import { Directive, effect, input } from '@angular/core';
import { AbstractControl, NG_VALIDATORS, ValidationErrors, Validator } from '@angular/forms';
import { FieldMessages } from '../../../shared/ui/form-field/form-field';
import { backupKeyWords, canonicalBackupKeyWord, parseBackupKey } from './backup-key-words';

export interface BackupKeyWordCheck {
  position: number;
  word: string;
}

export interface BackupKeyWordEntry {
  position: number;
  expected: string;
  typed: string;
}

export const BACKUP_KEY_WORD_MESSAGES: FieldMessages = {
  required: $localize`:@@operations.backupKey.word.required:Opište prosím toto slovo z uloženého klíče.`,
  backupKeyWord: $localize`:@@operations.backupKey.word.mismatch:Slovo nesedí s klíčem. Zkontrolujte, že opisujete slovo se správným číslem.`,
};

export function backupKeyWordLabel(position: number): string {
  return $localize`:@@operations.backupKey.word.label:${position}:position:. slovo klíče`;
}

export function backupKeyWordEntries(
  key: string,
  positions: readonly number[],
): BackupKeyWordEntry[] {
  const words = backupKeyWords(key);
  return positions.map((position) => ({
    position,
    expected: words[position - 1] ?? '',
    typed: '',
  }));
}

export function backupKeyWordChecks(entries: readonly BackupKeyWordEntry[]): BackupKeyWordCheck[] {
  return entries.map(({ position, typed }) => ({ position, word: typed.trim() }));
}

@Directive({
  selector: '[appBackupKeyWord][ngModel]',
  providers: [{ provide: NG_VALIDATORS, useExisting: BackupKeyWordValidator, multi: true }],
})
export class BackupKeyWordValidator implements Validator {
  readonly appBackupKeyWord = input.required<string>();

  private changed: (() => void) | undefined;

  constructor() {
    effect(() => {
      this.appBackupKeyWord();
      this.changed?.();
    });
  }

  validate(control: AbstractControl<string | null>): ValidationErrors | null {
    const typed = (control.value ?? '').trim();
    if (typed === '' || canonicalBackupKeyWord(typed) === this.appBackupKeyWord()) {
      return null;
    }
    return { backupKeyWord: true };
  }

  registerOnValidatorChange(changed: () => void): void {
    this.changed = changed;
  }
}

@Directive({
  selector: '[appBackupKey][ngModel]',
  providers: [{ provide: NG_VALIDATORS, useExisting: BackupKeyValidator, multi: true }],
})
export class BackupKeyValidator implements Validator {
  validate(control: AbstractControl<string | null>): ValidationErrors | null {
    const typed = (control.value ?? '').trim();
    return typed === '' || parseBackupKey(typed) !== null ? null : { backupKey: true };
  }
}
