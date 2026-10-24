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
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { describeProblem, problemTypeEndsWith } from '../../../core/auth/api-problem';
import { AuthStore } from '../../../core/auth/auth-store';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { FormControlDirective } from '../../../shared/ui/form-field/form-control';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { PasswordReveal } from '../../../shared/ui/password-reveal/password-reveal';
import { SETTING_LABELS, settingErrors } from '../../operations/setting-labels';
import {
  MailServerRequest,
  SettingName,
  SettingValueRequest,
  SetupApi,
} from '../../operations/setup/setup-api';
import { ReceiptSignature } from './receipt-signature/receipt-signature';
import { AdminApi, AdminSettingResponse, SettingGroup } from '../admin-api';
import { LiveNotice, Notice } from '../../../shared/ui/live-notice/live-notice';

type LoadState = 'loading' | 'ready' | 'error' | 'restarting' | 'slow';

type Input = 'text' | 'date' | 'flag' | 'secret';

interface Field {
  name: SettingName;
  label: string;
  hint: string;
  input: Input;
  original: string;
  value: string;
  remove: boolean;
  configured: boolean;
  stored: boolean;
  unreadable: boolean;
}

interface Confirmation {
  changes: string;
  warnings: string[];
  mailUnverified: boolean;
}

interface Group {
  id: SettingGroup;
  title: string;
  fields: Field[];
}

const UNAUTHENTICATED = 'auth/unauthenticated';
const FORBIDDEN = 'auth/forbidden';
const NOTHING_CHANGED = $localize`:@@admin.settings.nothingChanged:Nic jste nezměnili.`;
const MAIL_CONNECTION: readonly SettingName[] = [
  'MAIL_HOST',
  'MAIL_PORT',
  'MAIL_USERNAME',
  'MAIL_PASSWORD',
  'MAIL_AUTH',
  'MAIL_STARTTLS',
];

const NEW_SECRET_LABELS: Partial<Readonly<Record<SettingName, string>>> = {
  MAIL_PASSWORD: $localize`:@@admin.settings.secret.new.MAIL_PASSWORD:Nové heslo nebo klíč SMTP`,
  FIO_TOKEN: $localize`:@@admin.settings.secret.new.FIO_TOKEN:Nový token Fio API`,
};

const REMOVAL_EFFECTS: Partial<Readonly<Record<SettingName, string>>> = {
  MAIL_PASSWORD: $localize`:@@admin.settings.secret.removeEffect.MAIL_PASSWORD:Bez hesla web nepošle žádný e-mail: ani obnovu hesla, ani potvrzení registrace, ani měsíční přehled.`,
  FIO_TOKEN: $localize`:@@admin.settings.secret.removeEffect.FIO_TOKEN:Bez tokenu se přestanou stahovat platby z banky.`,
};

const GROUP_TITLES: Readonly<Record<SettingGroup, string>> = {
  SITE: $localize`:@@admin.settings.group.SITE:Web`,
  MAIL: $localize`:@@admin.settings.group.MAIL:E-maily`,
  BANK: $localize`:@@admin.settings.group.BANK:Banka`,
  RECEIPTS: $localize`:@@admin.settings.group.RECEIPTS:Potvrzení o daru`,
  ADMINISTRATORS: $localize`:@@admin.settings.group.ADMINISTRATORS:Správci`,
};

const HINTS: Partial<Readonly<Record<SettingName, string>>> = {
  PUBLIC_URL: $localize`:@@admin.settings.hint.PUBLIC_URL:Adresa, kterou vidí návštěvníci. Podle ní se tvoří odkazy v e-mailech.`,
  MAIL_FROM: $localize`:@@admin.settings.hint.MAIL_FROM:Doména adresy musí být ověřená u služby, přes kterou se posílá.`,
  FIO_TOKEN: $localize`:@@admin.settings.hint.FIO_TOKEN:Token z Fio internetového bankovnictví s právem jen pro čtení. Bez něj se platby nestahují.`,
  FIO_HISTORY_FROM: $localize`:@@admin.settings.hint.FIO_HISTORY_FROM:Prázdné znamená posledních 89 dní. Starší platby Fio vydá jen deset minut po odemčení historie v internetovém bankovnictví.`,
  PAIRING_EXCLUDED_ACCOUNTS: $localize`:@@admin.settings.hint.PAIRING_EXCLUDED_ACCOUNTS:Čísla účtů oddělená čárkou, třeba 2900233333/2010. Platby z nich se párují jen podle variabilního symbolu.`,
  RECEIPT_FIRST_YEAR: $localize`:@@admin.settings.hint.RECEIPT_FIRST_YEAR:Za dřívější roky si dárci potvrzení na webu nestáhnou.`,
};

const INPUTS: Partial<Readonly<Record<SettingName, Input>>> = {
  MAIL_AUTH: 'flag',
  MAIL_STARTTLS: 'flag',
  FIO_HISTORY_FROM: 'date',
};

@Component({
  selector: 'app-admin-settings',
  imports: [
    LiveNotice,
    FormsModule,
    FormField,
    FormControlDirective,
    PasswordReveal,
    ReceiptSignature,
  ],
  templateUrl: './admin-settings.html',
  styleUrl: './admin-settings.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSettings {
  private readonly api = inject(AdminApi);
  private readonly setupApi = inject(SetupApi);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly loginDialog = inject(LoginDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly title = viewChild<ElementRef<HTMLHeadingElement>>('title');
  private readonly saveButton = viewChild<ElementRef<HTMLButtonElement>>('saveButton');
  private readonly confirmCancel = viewChild<ElementRef<HTMLButtonElement>>('confirmCancel');

  protected readonly state = signal<LoadState>('loading');
  protected readonly groups = signal<Group[]>([]);
  protected readonly secretsCanBeStored = signal(true);
  protected readonly notice = signal<Notice | null>(null);
  protected readonly saveError = signal('');
  protected readonly fieldErrors = signal<string[]>([]);
  protected readonly confirmation = signal<Confirmation | null>(null);
  protected readonly saveStatus = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly testingMail = signal(false);
  protected readonly mailNotice = signal<Notice | null>(null);
  private verifiedMail: string | null = null;
  protected readonly unreadableSecrets = computed(() =>
    this.groups()
      .flatMap((group) => group.fields)
      .filter((field) => field.unreadable)
      .map((field) => field.label)
      .join(', '),
  );

  constructor() {
    this.load();
    afterNextRender(() => this.title()?.nativeElement.focus(), { injector: this.injector });
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .settings()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.groups.set(groupsOf(response.settings));
          this.secretsCanBeStored.set(response.secretsCanBeStored);
          this.state.set('ready');
          this.focusFragment();
        },
        error: (failure: unknown) => {
          if (problemTypeEndsWith(failure, UNAUTHENTICATED)) {
            this.sendToSignIn();
            return;
          }
          if (problemTypeEndsWith(failure, FORBIDDEN)) {
            this.router.navigateByUrl('/darce/prehled');
            return;
          }
          this.state.set('error');
        },
      });
  }

  protected secretState(field: Field): string {
    if (field.unreadable) {
      return $localize`:@@admin.settings.secret.unreadable:Uložená hodnota nejde přečíst, zadejte ji prosím znovu.`;
    }
    return field.configured
      ? $localize`:@@admin.settings.secret.set:Nastaveno`
      : $localize`:@@admin.settings.secret.unset:Nenastaveno`;
  }

  protected newSecretLabel(field: Field): string {
    return (
      NEW_SECRET_LABELS[field.name] ??
      $localize`:@@admin.settings.secret.new:Nová hodnota: ${field.label}:label:`
    );
  }

  protected removalEffect(field: Field): string {
    return REMOVAL_EFFECTS[field.name] ?? '';
  }

  protected setFlag(field: Field, on: boolean): void {
    field.value = String(on);
  }

  protected askSave(): void {
    this.notice.set(null);
    this.saveStatus.set(null);
    this.saveError.set('');
    this.fieldErrors.set([]);
    const changes = this.changes();
    if (changes.length === 0) {
      this.saveStatus.set(NOTHING_CHANGED);
      return;
    }
    this.confirmation.set(this.confirmationOf(changes));
    afterNextRender(() => this.confirmCancel()?.nativeElement.focus(), { injector: this.injector });
  }

  protected cancelSave(): void {
    this.confirmation.set(null);
    this.focusSaveButton();
  }

  protected save(): void {
    if (this.saving()) {
      return;
    }
    this.saving.set(true);
    this.api
      .changeSettings(this.changes())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved) => {
          this.saving.set(false);
          this.confirmation.set(null);
          if (!saved.restarting) {
            this.saveStatus.set(NOTHING_CHANGED);
            this.focusSaveButton();
            return;
          }
          this.state.set('restarting');
          this.watchRestart();
        },
        error: (failure: unknown) => {
          this.saving.set(false);
          this.confirmation.set(null);
          this.saveError.set(
            describeProblem(
              failure,
              $localize`:@@admin.settings.save.failed:Nastavení se nepodařilo uložit. Zkuste to prosím znovu.`,
            ),
          );
          this.fieldErrors.set(settingErrors(failure));
          this.focusSaveButton();
        },
      });
  }

  protected checkAgain(): void {
    this.state.set('restarting');
    this.watchRestart();
  }

  protected testMail(): void {
    if (this.testingMail()) {
      return;
    }
    const tried = this.mailServerRequest();
    this.mailNotice.set(null);
    this.testingMail.set(true);
    this.api
      .testMailServer(tried)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.testingMail.set(false);
          this.verifiedMail = result.ok ? JSON.stringify(tried) : null;
          this.mailNotice.set(
            result.ok
              ? {
                  kind: 'status',
                  text: $localize`:@@admin.settings.mailTest.ok:Spojení funguje, server přihlášení přijal.`,
                }
              : {
                  kind: 'alert',
                  text: $localize`:@@admin.settings.mailTest.refused:Ke serveru se nepodařilo přihlásit. Zkontrolujte prosím server, port, jméno a heslo.`,
                },
          );
        },
        error: (failure: unknown) => {
          this.testingMail.set(false);
          this.mailNotice.set({
            kind: 'alert',
            text: describeProblem(
              failure,
              $localize`:@@admin.settings.mailTest.failed:Spojení se nepodařilo ověřit. Zkuste to prosím znovu.`,
            ),
          });
        },
      });
  }

  private watchRestart(): void {
    this.setupApi
      .watchRestart()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((outcome) => {
        if (outcome === 'slow') {
          this.state.set('slow');
          return;
        }
        this.notice.set({
          kind: 'status',
          text: $localize`:@@admin.settings.saved:Nastavení je uložené a web po restartu běží s ním.`,
        });
        this.load();
      });
  }

  private mailServerRequest(): MailServerRequest {
    const value = (name: SettingName) => this.field(name)?.value.trim() ?? '';
    return {
      host: value('MAIL_HOST'),
      port: Number(value('MAIL_PORT')),
      username: value('MAIL_USERNAME'),
      password: this.field('MAIL_PASSWORD')?.value ?? '',
      auth: value('MAIL_AUTH') === 'true',
      startTls: value('MAIL_STARTTLS') === 'true',
    };
  }

  private confirmationOf(changes: SettingValueRequest[]): Confirmation {
    const removed = changes
      .map((change) => this.field(change.name))
      .filter((field): field is Field => field?.input === 'secret' && field.remove);
    const labels = changes.map((change) => {
      const field = this.field(change.name);
      const label = field?.label ?? change.name;
      return field?.input === 'secret' && field.remove
        ? $localize`:@@admin.settings.confirm.removed:${label}:label: (odebrat)`
        : label;
    });
    const mailChanged = changes.some((change) => MAIL_CONNECTION.includes(change.name));
    return {
      changes: labels.join(', '),
      warnings: removed.map((field) => this.removalEffect(field)).filter((text) => text !== ''),
      mailUnverified: mailChanged && this.verifiedMail !== JSON.stringify(this.mailServerRequest()),
    };
  }

  private focusSaveButton(): void {
    afterNextRender(() => this.saveButton()?.nativeElement.focus(), { injector: this.injector });
  }

  private focusFragment(): void {
    const fragment = this.route.snapshot.fragment;
    if (!fragment) {
      return;
    }
    afterNextRender(() => document.getElementById(fragment)?.focus(), { injector: this.injector });
  }

  private changes(): SettingValueRequest[] {
    return this.groups()
      .flatMap((group) => group.fields)
      .flatMap((field): SettingValueRequest[] => {
        if (field.input === 'secret') {
          if (field.remove) {
            return [{ name: field.name, value: '' }];
          }
          const secret = field.value.trim();
          return secret === '' ? [] : [{ name: field.name, value: secret }];
        }
        const value = field.value.trim();
        return value === field.original ? [] : [{ name: field.name, value }];
      });
  }

  private field(name: SettingName): Field | undefined {
    return this.groups()
      .flatMap((group) => group.fields)
      .find((field) => field.name === name);
  }

  private sendToSignIn(): void {
    const returnTo = this.router.url;
    this.auth.logout().subscribe(() => {
      this.router.navigateByUrl('/');
      this.loginDialog.open('login', { returnTo });
    });
  }
}

function groupsOf(settings: AdminSettingResponse[]): Group[] {
  const groups: Group[] = [];
  for (const setting of settings) {
    let group = groups.find((candidate) => candidate.id === setting.group);
    if (!group) {
      group = { id: setting.group, title: GROUP_TITLES[setting.group], fields: [] };
      groups.push(group);
    }
    const original = setting.secret ? '' : (setting.value ?? '');
    group.fields.push({
      name: setting.name,
      label: SETTING_LABELS[setting.name],
      hint: HINTS[setting.name] ?? '',
      input: setting.secret ? 'secret' : (INPUTS[setting.name] ?? 'text'),
      original,
      value: original,
      remove: false,
      configured: setting.configured,
      stored: setting.stored,
      unreadable: setting.unreadable,
    });
  }
  return groups;
}
