/// <reference types="@angular/localize" />

import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule, NgForm } from '@angular/forms';
import { describeProblem, problemTypeEndsWith } from '../../../core/auth/api-problem';
import { AuthStore } from '../../../core/auth/auth-store';
import {
  PasskeyAuthenticator,
  PasskeyCeremonyError,
} from '../../../core/auth/passkey-authenticator';
import { FocusFirstInvalid } from '../../../shared/ui/form-field/focus-first-invalid';
import { FormControlDirective } from '../../../shared/ui/form-field/form-control';
import { FieldMessages, FormField } from '../../../shared/ui/form-field/form-field';
import { LiveNotice, Notice } from '../../../shared/ui/live-notice/live-notice';
import { formatBankTime } from '../../donations/donation-date';
import { BackupKeyPanel } from '../../operations/backup-key/backup-key-panel';
import {
  BACKUP_KEY_WORD_MESSAGES,
  BackupKeyWordEntry,
  BackupKeyWordValidator,
  backupKeyWordChecks,
  backupKeyWordEntries,
  backupKeyWordLabel,
} from '../../operations/backup-key/backup-key-word-check';
import { AdminApi, BackupKeyRevealRequest, BackupKeyStatus } from '../admin-api';

const CODE_MESSAGES: FieldMessages = {
  required: $localize`:@@donor.form.code.required:Opište prosím kód z aplikace.`,
  pattern: $localize`:@@donor.form.code.invalid:Kód má přesně šest číslic.`,
};

const CONFIRMATION_EXPIRED = 'operations/backup-key-confirmation-expired';

const REVEAL_FAILED = $localize`:@@admin.backups.key.reveal.failed:Klíč se nepodařilo zobrazit. Zkuste to prosím znovu.`;

@Component({
  selector: 'app-backup-key-card',
  imports: [
    FormsModule,
    FormField,
    FormControlDirective,
    FocusFirstInvalid,
    LiveNotice,
    BackupKeyPanel,
    BackupKeyWordValidator,
  ],
  templateUrl: './backup-key-card.html',
  styleUrl: './backup-key-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BackupKeyCard {
  private readonly api = inject(AdminApi);
  private readonly auth = inject(AuthStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly showButton = viewChild<ElementRef<HTMLButtonElement>>('showButton');
  private readonly codeField = viewChild<ElementRef<HTMLInputElement>>('codeField');
  private readonly revealedRegion = viewChild<ElementRef<HTMLElement>>('revealedRegion');

  readonly status = input.required<BackupKeyStatus>();
  readonly changed = output<BackupKeyStatus>();

  protected readonly codeMessages = CODE_MESSAGES;
  protected readonly wordMessages = BACKUP_KEY_WORD_MESSAGES;
  protected readonly wordLabel = backupKeyWordLabel;
  protected readonly codeHint = $localize`:@@admin.backups.key.codeHint:Počkejte, až aplikace ukáže nový kód (mění se každých 30 sekund), a opište ho.`;
  protected readonly passkeySupported = inject(PasskeyAuthenticator).supported();
  protected readonly usesCode = computed(() => this.auth.donor()?.secondFactor.enabled ?? false);
  protected readonly asking = signal(false);
  protected readonly revealing = signal(false);
  protected readonly confirming = signal(false);
  protected readonly revealed = signal<string | null>(null);
  protected readonly error = signal('');
  protected readonly notice = signal<Notice | null>(null);
  protected readonly words = signal<BackupKeyWordEntry[]>([]);
  protected readonly confirmedAt = computed(() => {
    const at = this.status().confirmedAt;
    return at === null ? '' : formatBankTime(at);
  });

  protected code = '';

  protected ask(): void {
    this.notice.set(null);
    this.error.set('');
    this.code = '';
    this.asking.set(true);
    afterNextRender(() => this.codeField()?.nativeElement.focus(), { injector: this.injector });
  }

  protected cancel(): void {
    this.asking.set(false);
    this.error.set('');
    this.focusShowButton();
  }

  protected reveal(form: NgForm): void {
    if (this.revealing()) {
      return;
    }
    if (!this.usesCode()) {
      this.revealWithPasskey();
      return;
    }
    if (form.invalid) {
      return;
    }
    this.send({ secondFactorCode: this.code.trim() });
  }

  protected revealWithPasskey(): void {
    if (this.revealing()) {
      return;
    }
    this.error.set('');
    this.revealing.set(true);
    this.auth
      .confirmWith(null)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (confirmation) => {
          this.revealing.set(false);
          this.send({ passkey: confirmation.passkey });
        },
        error: (failure: unknown) => {
          this.revealing.set(false);
          this.error.set(
            failure instanceof PasskeyCeremonyError
              ? failure.reason === 'unsupported'
                ? $localize`:@@admin.backups.key.passkeyUnsupported:Tento prohlížeč přístupové klíče nepodporuje. Klíč si zobrazte v prohlížeči, ve kterém se klíčem přihlašujete.`
                : $localize`:@@admin.backups.key.passkeyCancelled:Zařízení zobrazení nepotvrdilo. Zkuste to prosím znovu.`
              : describeProblem(failure, REVEAL_FAILED),
          );
        },
      });
  }

  protected confirm(form: NgForm): void {
    if (this.confirming() || form.invalid) {
      return;
    }
    this.confirming.set(true);
    this.notice.set(null);
    this.api
      .confirmBackupKey(backupKeyWordChecks(this.words()))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (status) => {
          this.confirming.set(false);
          this.revealed.set(null);
          this.words.set([]);
          this.notice.set({
            kind: 'status',
            text: $localize`:@@admin.backups.key.confirmed:Děkujeme, uložení klíče jsme si poznamenali. Klíč jsme zase skryli.`,
          });
          this.changed.emit(status);
          this.focusShowButton();
        },
        error: (failure: unknown) => {
          this.confirming.set(false);
          this.notice.set({
            kind: 'alert',
            text: describeProblem(
              failure,
              $localize`:@@admin.backups.key.confirmFailed:Uložení klíče se nepodařilo potvrdit. Zkuste to prosím znovu.`,
            ),
          });
          if (problemTypeEndsWith(failure, CONFIRMATION_EXPIRED)) {
            this.revealed.set(null);
            this.words.set([]);
            this.focusShowButton();
          }
        },
      });
  }

  protected hide(): void {
    this.revealed.set(null);
    this.words.set([]);
    this.notice.set(null);
    this.focusShowButton();
  }

  private send(proof: BackupKeyRevealRequest): void {
    this.revealing.set(true);
    this.error.set('');
    this.api
      .revealBackupKey(proof)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.revealing.set(false);
          this.asking.set(false);
          this.code = '';
          this.words.set(backupKeyWordEntries(response.key, response.checkPositions));
          this.revealed.set(response.key);
          afterNextRender(() => this.revealedRegion()?.nativeElement.focus(), {
            injector: this.injector,
          });
        },
        error: (failure: unknown) => {
          this.revealing.set(false);
          this.error.set(describeProblem(failure, REVEAL_FAILED));
          afterNextRender(
            () => {
              const field = this.codeField()?.nativeElement;
              field?.focus();
              field?.select();
            },
            { injector: this.injector },
          );
        },
      });
  }

  private focusShowButton(): void {
    afterNextRender(() => this.showButton()?.nativeElement.focus(), { injector: this.injector });
  }
}
