/// <reference types="@angular/localize" />

import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { HttpEventType } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule, NgForm } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  describeProblem,
  describeProblemWithoutFields,
  problemOf,
  problemTypeEndsWith,
} from '../../../core/auth/api-problem';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { FocusFirstInvalid } from '../../../shared/ui/form-field/focus-first-invalid';
import { FormControlDirective } from '../../../shared/ui/form-field/form-control';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { PasswordReveal } from '../../../shared/ui/password-reveal/password-reveal';
import { placeServerErrors } from '../../../shared/ui/form-field/server-errors';
import { SETTING_LABELS, settingLabel } from '../setting-labels';
import {
  MailServerRequest,
  RESTORE_MAX_POLLS,
  SettingName,
  SettingValueRequest,
  SetupApi,
  SetupStatusResponse,
} from './setup-api';
import { Notice } from '../../../shared/ui/live-notice/live-notice';

type Panel =
  | 'loading'
  | 'error'
  | 'locked'
  | 'form'
  | 'restarting'
  | 'done'
  | 'slow'
  | 'closed'
  | 'restore'
  | 'restoring'
  | 'restoreSlow'
  | 'restored';

const SETUP_COMPLETED = 'operations/setup-completed';
const SETUP_LOCKED = 'operations/setup-locked';
const DEFAULT_PUBLIC_URL = 'https://nfnn.cz';
const DEFAULT_MAIL_HOST = 'smtp-relay.brevo.com';
const DEFAULT_MAIL_PORT = 587;
const DEFAULT_ADDRESS = 'info@nfnn.cz';
const PORT_INVALID = $localize`:@@operations.setup.mailPort.invalid:Port je číslo od 1 do 65535.`;
const BACKUP_EXTENSION = '.dump';
const SETTING_FIELDS: Readonly<Partial<Record<SettingName, string>>> = {
  PUBLIC_URL: 'publicUrl',
  MAIL_HOST: 'mailHost',
  MAIL_PORT: 'mailPort',
  MAIL_USERNAME: 'mailUsername',
  MAIL_PASSWORD: 'mailPassword',
  MAIL_FROM: 'mailFrom',
  CONTACT_RECIPIENT: 'contactRecipient',
  FIO_TOKEN: 'fioToken',
  ADMIN_EMAILS: 'adminEmail',
};

@Component({
  selector: 'app-first-setup',
  imports: [
    FormsModule,
    RouterLink,
    FormField,
    FormControlDirective,
    FocusFirstInvalid,
    PasswordReveal,
  ],
  templateUrl: './first-setup.html',
  styleUrl: './first-setup.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FirstSetup {
  private readonly api = inject(SetupApi);
  private readonly loginDialog = inject(LoginDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  private readonly mailTestButton = viewChild<ElementRef<HTMLButtonElement>>('mailTestButton');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  protected readonly labels = SETTING_LABELS;
  protected readonly panel = signal<Panel>('loading');
  protected readonly unlocking = signal(false);
  protected readonly codeError = signal('');
  protected readonly saving = signal(false);
  protected readonly saveError = signal('');
  protected readonly fieldErrors = signal<string[]>([]);
  protected readonly testingMail = signal(false);
  protected readonly mailNotice = signal<Notice | null>(null);
  protected readonly mailUnverified = signal(false);
  protected readonly backupFileError = signal('');
  protected readonly backupFile = signal<File | null>(null);
  protected readonly uploadPercent = signal<number | null>(null);
  protected readonly restoreError = signal('');
  protected readonly restoredBeforeSetup = signal(false);

  protected readonly codeMessages = {
    required: $localize`:@@operations.setup.code.required:Opište prosím kód z logu.`,
  };
  protected readonly urlMessages = {
    required: $localize`:@@operations.setup.publicUrl.required:Vyplňte prosím adresu webu.`,
    pattern: $localize`:@@operations.setup.publicUrl.invalid:Napište celou adresu včetně https://, například https://nfnn.cz.`,
  };
  protected readonly hostMessages = {
    required: $localize`:@@operations.setup.mailHost.required:Vyplňte prosím server pro odesílání.`,
  };
  protected readonly portMessages = {
    required: $localize`:@@operations.setup.mailPort.required:Vyplňte prosím port.`,
    min: PORT_INVALID,
    max: PORT_INVALID,
  };
  protected readonly usernameMessages = {
    required: $localize`:@@operations.setup.mailUsername.required:Vyplňte prosím přihlašovací jméno ze stránky SMTP v Brevo.`,
  };
  protected readonly passwordMessages = {
    required: $localize`:@@operations.setup.mailPassword.required:Vyplňte prosím heslo nebo klíč SMTP.`,
  };
  protected readonly fioTokenLabel = $localize`:@@operations.setup.fioToken.label:Token Fio API (jen pro čtení, nepovinné)`;
  protected readonly emailMessages = {
    required: $localize`:@@operations.setup.email.required:Vyplňte prosím e-mailovou adresu.`,
    email: $localize`:@@operations.setup.email.invalid:Tohle není platná e-mailová adresa.`,
  };

  protected code = '';
  protected publicUrl = defaultPublicUrl();
  protected mail = {
    host: DEFAULT_MAIL_HOST,
    port: DEFAULT_MAIL_PORT,
    username: '',
    password: '',
    auth: true,
    startTls: true,
    from: DEFAULT_ADDRESS,
    contactRecipient: DEFAULT_ADDRESS,
  };
  protected fioToken = '';
  protected adminEmail = '';

  private unlockedCode: string | null = null;
  private restoreRequestId: string | null = null;
  private verifiedMailServer: string | null = null;

  constructor() {
    this.load();
  }

  protected load(): void {
    this.panel.set('loading');
    this.api
      .status()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (status) => {
          if (!status.required) {
            this.show('closed');
          } else {
            this.show(status.codeRequired ? 'locked' : 'form');
          }
        },
        error: () => this.show('error'),
      });
  }

  protected unlock(form: NgForm): void {
    if (this.unlocking()) {
      return;
    }
    this.codeError.set('');
    if (form.invalid) {
      return;
    }
    const code = this.code.trim();
    this.unlocking.set(true);
    this.api
      .unlock(code)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.unlocking.set(false);
          this.unlockedCode = code;
          this.show(this.restoreError() ? 'restore' : 'form');
        },
        error: (failure: unknown) => {
          this.unlocking.set(false);
          if (problemTypeEndsWith(failure, SETUP_COMPLETED)) {
            this.show('closed');
            return;
          }
          this.codeError.set(
            problemTypeEndsWith(failure, SETUP_LOCKED)
              ? $localize`:@@operations.setup.code.wrong:Kód nesedí. Opište prosím ten z posledního startu webu, kód se při každém startu mění.`
              : describeProblem(
                  failure,
                  $localize`:@@operations.setup.code.failed:Kód se nepodařilo ověřit. Zkuste to prosím znovu.`,
                ),
          );
        },
      });
  }

  protected testMail(): void {
    if (this.testingMail()) {
      return;
    }
    this.mailNotice.set(null);
    this.testingMail.set(true);
    const server = this.mailServer();
    this.api
      .testMail(this.unlockedCode, server)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.testingMail.set(false);
          this.verifiedMailServer = result.ok ? JSON.stringify(server) : null;
          if (result.ok) {
            this.mailUnverified.set(false);
          }
          this.mailNotice.set(
            result.ok
              ? {
                  kind: 'status',
                  text: $localize`:@@operations.setup.mailTest.ok:Spojení funguje, server přihlášení přijal.`,
                }
              : {
                  kind: 'alert',
                  text: $localize`:@@operations.setup.mailTest.refused:Ke serveru se nepodařilo přihlásit. Zkontrolujte prosím server, port, jméno a heslo.`,
                },
          );
        },
        error: (failure: unknown) => {
          this.testingMail.set(false);
          this.mailNotice.set({
            kind: 'alert',
            text: describeProblem(
              failure,
              $localize`:@@operations.setup.mailTest.failed:Spojení se nepodařilo ověřit. Zkuste to prosím znovu.`,
            ),
          });
        },
      });
  }

  protected testMailFromWarning(): void {
    this.mailUnverified.set(false);
    this.testMail();
    this.mailTestButton()?.nativeElement.focus();
  }

  protected save(form: NgForm, unverifiedMailAccepted = false): void {
    if (this.saving()) {
      return;
    }
    this.saveError.set('');
    this.fieldErrors.set([]);
    if (form.invalid) {
      this.mailUnverified.set(false);
      return;
    }
    if (!unverifiedMailAccepted && this.verifiedMailServer !== JSON.stringify(this.mailServer())) {
      this.mailUnverified.set(true);
      return;
    }
    this.mailUnverified.set(false);
    this.saving.set(true);
    this.api
      .complete({ code: this.unlockedCode, settings: this.settings() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.show('restarting');
          this.watchRestart();
        },
        error: (failure: unknown) => {
          this.saving.set(false);
          if (problemTypeEndsWith(failure, SETUP_COMPLETED)) {
            this.show('closed');
            return;
          }
          if (problemTypeEndsWith(failure, SETUP_LOCKED)) {
            this.unlockedCode = null;
            this.code = '';
            this.show('locked');
            return;
          }
          this.refuseSettings(form, failure);
        },
      });
  }

  protected checkAgain(): void {
    this.show('restarting');
    this.watchRestart();
  }

  protected signUp(): void {
    this.loginDialog.open('register', { email: this.adminEmail.trim() });
  }

  protected openRestore(): void {
    this.restoreError.set('');
    this.show('restore');
  }

  protected closeRestore(): void {
    this.restoreError.set('');
    this.show('form');
  }

  protected chooseBackup(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0) ?? null;
    this.backupFile.set(file);
    this.restoreError.set('');
    this.backupFileError.set(
      file === null || file.name.toLowerCase().endsWith(BACKUP_EXTENSION)
        ? ''
        : $localize`:@@operations.setup.restore.wrongFile:Tohle není soubor zálohy. Vyberte prosím soubor s příponou .dump.`,
    );
  }

  protected uploadBackup(): void {
    const file = this.backupFile();
    if (file === null || this.backupFileError() !== '' || this.uploadPercent() !== null) {
      return;
    }
    this.restoreError.set('');
    this.uploadPercent.set(0);
    this.api
      .uploadBackup(this.unlockedCode, file)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (event) => {
          if (event.type === HttpEventType.UploadProgress) {
            this.uploadPercent.set(
              event.total ? Math.min(100, Math.floor((100 * event.loaded) / event.total)) : 0,
            );
          } else if (event.type === HttpEventType.Response) {
            this.uploadPercent.set(null);
            this.restoreRequestId = event.body?.requestId ?? null;
            this.show('restoring');
            this.watchRestore();
          }
        },
        error: (failure: unknown) => {
          this.uploadPercent.set(null);
          if (problemTypeEndsWith(failure, SETUP_COMPLETED)) {
            this.show('closed');
            return;
          }
          if (problemTypeEndsWith(failure, SETUP_LOCKED)) {
            this.unlockedCode = null;
            this.code = '';
            this.show('locked');
            return;
          }
          this.restoreError.set(
            describeProblem(
              failure,
              $localize`:@@operations.setup.restore.uploadFailed:Zálohu se nepodařilo nahrát. Zkuste to prosím znovu.`,
            ),
          );
        },
      });
  }

  protected watchRestore(): void {
    this.show('restoring');
    this.api
      .watchRestart(RESTORE_MAX_POLLS)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((outcome) => {
        if (outcome === 'restarted') {
          this.checkRestore();
        } else {
          this.show('restoreSlow');
        }
      });
  }

  protected signInAfterRestore(): void {
    this.loginDialog.open('login', { returnTo: '/sprava/nastaveni' });
  }

  private checkRestore(): void {
    this.api
      .status()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (status) => this.reportRestore(status),
        error: () => this.show('restoreSlow'),
      });
  }

  private reportRestore(status: SetupStatusResponse): void {
    if (!status.required) {
      this.show('restored');
      return;
    }
    const run = status.lastRestore ?? null;
    const ours = run !== null && run.requestId === this.restoreRequestId;
    if (status.codeRequired) {
      this.unlockedCode = null;
      this.code = '';
    }
    if (ours && run.outcome === 'OK') {
      this.restoreError.set('');
      this.restoredBeforeSetup.set(true);
      this.show(status.codeRequired ? 'locked' : 'form');
      return;
    }
    this.restoreError.set(
      ours
        ? $localize`:@@operations.setup.restore.failed:Obnova se nepovedla: ${run.error ?? ''}:error:. Web zůstal prázdný; zkuste prosím jiný soubor zálohy.`
        : $localize`:@@operations.setup.restore.notPickedUp:Kontejner záloh si obnovu do pěti minut nevzal. Zkuste to prosím znovu; když se to opakuje, podívejte se do logu kontejneru nfnn-backup v ZimaOS.`,
    );
    this.show(status.codeRequired ? 'locked' : 'restore');
  }

  private refuseSettings(form: NgForm, failure: unknown): void {
    const errors = problemOf(failure)?.errors ?? [];
    const unplaced = placeServerErrors(form, errors, SETTING_FIELDS);
    const generic = $localize`:@@operations.setup.save.failed:Nastavení se nepodařilo uložit. Zkuste to prosím znovu.`;
    this.saveError.set(
      unplaced.length === errors.length
        ? describeProblem(failure, generic)
        : describeProblemWithoutFields(failure, generic),
    );
    this.fieldErrors.set(
      unplaced
        .filter((error) => error.message !== '')
        .map((error) => {
          const label = settingLabel(error.field);
          return label === '' ? error.message : `${label}: ${error.message}`;
        }),
    );
    if (unplaced.length < errors.length) {
      afterNextRender(
        () => this.host.querySelector<HTMLElement>('.setup-form .form-control.ng-invalid')?.focus(),
        { injector: this.injector },
      );
    }
  }

  private watchRestart(): void {
    this.api
      .watchRestart()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((outcome) => this.show(outcome === 'restarted' ? 'done' : 'slow'));
  }

  private mailServer(): MailServerRequest {
    return {
      host: this.mail.host.trim(),
      port: Number(this.mail.port),
      username: this.mail.username.trim(),
      password: this.mail.password,
      auth: this.mail.auth,
      startTls: this.mail.startTls,
    };
  }

  private settings(): SettingValueRequest[] {
    const values: Record<string, string> = {
      PUBLIC_URL: this.publicUrl.trim().replace(/\/+$/, ''),
      MAIL_HOST: this.mail.host.trim(),
      MAIL_PORT: String(this.mail.port),
      MAIL_USERNAME: this.mail.username.trim(),
      MAIL_PASSWORD: this.mail.password,
      MAIL_AUTH: String(this.mail.auth),
      MAIL_STARTTLS: String(this.mail.startTls),
      MAIL_FROM: this.mail.from.trim(),
      CONTACT_RECIPIENT: this.mail.contactRecipient.trim(),
      FIO_TOKEN: this.fioToken.trim(),
      ADMIN_EMAILS: this.adminEmail.trim(),
    };
    return Object.entries(values).map(([name, value]) => ({ name: name as SettingName, value }));
  }

  private show(panel: Panel): void {
    this.panel.set(panel);
    afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.injector });
  }
}

function defaultPublicUrl(): string {
  const origin = globalThis.location?.origin ?? '';
  return origin.startsWith('https://') ? origin : DEFAULT_PUBLIC_URL;
}
