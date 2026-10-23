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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule, NgForm } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { describeProblem, problemTypeEndsWith } from '../../../core/auth/api-problem';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { FocusFirstInvalid } from '../../../shared/ui/form-field/focus-first-invalid';
import { FormControlDirective } from '../../../shared/ui/form-field/form-control';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { PasswordReveal } from '../../../shared/ui/password-reveal/password-reveal';
import { SETTING_LABELS, settingErrors } from '../setting-labels';
import { MailServerRequest, SettingName, SettingValueRequest, SetupApi } from './setup-api';

type Panel = 'loading' | 'error' | 'locked' | 'form' | 'restarting' | 'done' | 'slow' | 'closed';

interface Notice {
  kind: 'status' | 'alert';
  text: string;
}

const SETUP_COMPLETED = 'operations/setup-completed';
const SETUP_LOCKED = 'operations/setup-locked';
const DEFAULT_PUBLIC_URL = 'https://nfnn.cz';
const DEFAULT_MAIL_HOST = 'smtp-relay.brevo.com';
const DEFAULT_MAIL_PORT = 587;
const DEFAULT_ADDRESS = 'info@nfnn.cz';
const PORT_INVALID = $localize`:@@operations.setup.mailPort.invalid:Port je číslo od 1 do 65535.`;

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

  protected readonly labels = SETTING_LABELS;
  protected readonly panel = signal<Panel>('loading');
  protected readonly unlocking = signal(false);
  protected readonly codeError = signal('');
  protected readonly saving = signal(false);
  protected readonly saveError = signal('');
  protected readonly fieldErrors = signal<string[]>([]);
  protected readonly testingMail = signal(false);
  protected readonly mailNotice = signal<Notice | null>(null);

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
  protected tunnelToken = '';

  private unlockedCode: string | null = null;

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
          this.show('form');
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
    this.api
      .testMail(this.unlockedCode, this.mailServer())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.testingMail.set(false);
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

  protected save(form: NgForm): void {
    if (this.saving()) {
      return;
    }
    this.saveError.set('');
    this.fieldErrors.set([]);
    if (form.invalid) {
      return;
    }
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
          this.saveError.set(
            describeProblem(
              failure,
              $localize`:@@operations.setup.save.failed:Nastavení se nepodařilo uložit. Zkuste to prosím znovu.`,
            ),
          );
          this.fieldErrors.set(settingErrors(failure));
        },
      });
  }

  protected checkAgain(): void {
    this.show('restarting');
    this.watchRestart();
  }

  protected signUp(): void {
    this.loginDialog.open('register');
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
      TUNNEL_TOKEN: this.tunnelToken.trim(),
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
