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
import { FormsModule, NgForm } from '@angular/forms';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { describeProblem, problemTypeEndsWith } from '../../../core/auth/api-problem';
import { AuthStore } from '../../../core/auth/auth-store';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { isChangedMeanwhile, versionInRefusal } from '../../../core/version/row-version';
import { BankLogoRemoveDialog } from './bank-logo-remove-dialog';
import { FocusFirstInvalid } from '../../../shared/ui/form-field/focus-first-invalid';
import { FormControlDirective } from '../../../shared/ui/form-field/form-control';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { LiveNotice, Notice } from '../../../shared/ui/live-notice/live-notice';
import { NeedsConnection } from '../../../shared/ui/needs-connection/needs-connection';
import { BankMark } from '../../donations/bank-logo/bank-mark';
import { BankNames } from '../../donations/bank-names';
import { bankLogoImageUrl } from '../../donations/bank-logos-api';
import { shortBankName } from '../../donations/czech-banks';
import { formatBankTime } from '../../donations/donation-date';
import { AdminApi, AdminBankLogoResponse, BankLogoFailure } from '../admin-api';
import { ChangedMeanwhileDialog } from '../changed-meanwhile/changed-meanwhile-dialog';

type LoadState = 'loading' | 'ready' | 'error';
type RowAction = 'save' | 'refresh';

interface Busy {
  readonly code: string;
  readonly action: RowAction | 'remove' | 'add';
}

interface StaleWrite {
  readonly code: string;
  readonly sourceUrl: string | null;
  readonly version: string | null;
  readonly fromAddForm: boolean;
}

const UNAUTHENTICATED = 'auth/unauthenticated';
const FORBIDDEN = 'auth/forbidden';
const SOURCE_INVALID = 'donations/bank-logo-source-invalid';
const LOGO_NOT_FOUND = 'donations/bank-logo-not-found';
const SOURCE_CONTROL = 'sourceUrl';
const CODE_CONTROL = 'code';

const FAILURE_WORDS: Readonly<Record<BankLogoFailure, string>> = {
  status: $localize`:@@admin.bankLogos.failure.status:server s obrázkem odpověděl chybou`,
  redirected: $localize`:@@admin.bankLogos.failure.redirected:adresa přesměrovává jinam`,
  timeout: $localize`:@@admin.bankLogos.failure.timeout:server neodpověděl do 10 sekund`,
  unreachable: $localize`:@@admin.bankLogos.failure.unreachable:se serverem se nepodařilo spojit`,
  'unknown-host': $localize`:@@admin.bankLogos.failure.unknownHost:server s tímto názvem neexistuje`,
  'non-public-address': $localize`:@@admin.bankLogos.failure.nonPublicAddress:adresa vede do neveřejné sítě`,
  'too-large': $localize`:@@admin.bankLogos.failure.tooLarge:soubor je větší než 1 MB`,
  'unsupported-type': $localize`:@@admin.bankLogos.failure.unsupportedType:na adrese není obrázek PNG ani JPEG`,
  'image-too-large': $localize`:@@admin.bankLogos.failure.imageTooLarge:obrázek má příliš mnoho pixelů`,
  'unreadable-image': $localize`:@@admin.bankLogos.failure.unreadableImage:obrázek se nepodařilo přečíst`,
  interrupted: $localize`:@@admin.bankLogos.failure.interrupted:stahování se přerušilo`,
};

@Component({
  selector: 'app-admin-bank-logos',
  imports: [
    FormsModule,
    FormField,
    FormControlDirective,
    FocusFirstInvalid,
    LiveNotice,
    NeedsConnection,
    BankLogoRemoveDialog,
    ChangedMeanwhileDialog,
    BankMark,
  ],
  templateUrl: './admin-bank-logos.html',
  styleUrl: './admin-bank-logos.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminBankLogos {
  private readonly api = inject(AdminApi);
  private readonly bankNames = inject(BankNames);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly loginDialog = inject(LoginDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly title = viewChild.required<ElementRef<HTMLHeadingElement>>('title');
  private readonly noticeRegion = viewChild('noticeRegion', { read: ElementRef });
  private readonly addForm = viewChild<NgForm>('addForm');
  private readonly forms = new Map<string, NgForm>();

  protected readonly state = signal<LoadState>('loading');
  protected readonly items = signal<AdminBankLogoResponse[]>([]);
  private readonly generation = signal(0);
  protected readonly rows = computed(() =>
    this.items().map((item) => ({ item, key: `${this.generation()}-${item.code}` })),
  );
  protected readonly notice = signal<Notice | null>(null);
  protected readonly busy = signal<Busy | null>(null);
  protected readonly rowErrors = signal<Readonly<Record<string, string>>>({});
  protected readonly addError = signal<string | null>(null);
  protected readonly removing = signal<AdminBankLogoResponse | null>(null);
  protected readonly removeError = signal<string | null>(null);
  protected readonly stale = signal<StaleWrite | null>(null);

  protected newCode = '';
  protected newSource = '';

  protected readonly sourcePattern = 'https://\\S+';
  protected readonly codePattern = '[0-9]{4}';
  protected readonly sourceMessages = {
    required: $localize`:@@admin.bankLogos.source.required:Vyplňte prosím adresu loga.`,
    pattern: $localize`:@@admin.bankLogos.source.pattern:Adresa musí začínat https:// a nesmí obsahovat mezery.`,
    maxlength: $localize`:@@admin.bankLogos.source.maxlength:Adresa může mít nejvýš 500 znaků.`,
  };
  protected readonly codeMessages = {
    required: $localize`:@@admin.bankLogos.code.required:Vyplňte prosím kód banky.`,
    pattern: $localize`:@@admin.bankLogos.code.pattern:Kód banky má čtyři číslice, třeba 0800.`,
  };

  constructor() {
    this.load();
    afterNextRender(() => this.title().nativeElement.focus(), { injector: this.injector });
  }

  protected load(onLoaded?: () => void): void {
    if (this.state() !== 'ready') {
      this.state.set('loading');
    }
    this.api
      .bankLogos()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          this.forms.clear();
          this.items.set(list.items);
          this.generation.update((value) => value + 1);
          this.rowErrors.set({});
          this.state.set('ready');
          onLoaded?.();
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

  protected bankName(item: AdminBankLogoResponse): string {
    return item.bankName === null
      ? $localize`:@@admin.bankLogos.unknownBank:Banka, kterou seznam ČNB nezná`
      : shortBankName(item.bankName);
  }

  protected markName(item: AdminBankLogoResponse): string | null {
    return item.bankName === null ? null : shortBankName(item.bankName);
  }

  protected imageOf(item: AdminBankLogoResponse): string | null {
    return item.imageId === null ? null : bankLogoImageUrl(item.imageId);
  }

  protected stateLine(item: AdminBankLogoResponse): string {
    if (item.fetchedAt === null) {
      return $localize`:@@admin.bankLogos.state.never:Zatím nestaženo.`;
    }
    const fetched = formatBankTime(item.fetchedAt);
    if (item.checkedAt === null || item.checkedAt === item.fetchedAt) {
      return $localize`:@@admin.bankLogos.state.fetched:Staženo ${fetched}:fetched:.`;
    }
    const checked = formatBankTime(item.checkedAt);
    return $localize`:@@admin.bankLogos.state.checked:Staženo ${fetched}:fetched:, naposledy zkontrolováno ${checked}:checked:.`;
  }

  protected failureLine(item: AdminBankLogoResponse): string | null {
    if (item.lastFailure === null) {
      return null;
    }
    const reason =
      FAILURE_WORDS[item.lastFailure] ??
      $localize`:@@admin.bankLogos.failure.unknown:důvod neznáme`;
    return $localize`:@@admin.bankLogos.failure:Poslední stažení se nepovedlo: ${reason}:reason:.`;
  }

  protected isBusy(code: string, action: Busy['action']): boolean {
    const busy = this.busy();
    return busy !== null && busy.code === code && busy.action === action;
  }

  protected save(item: AdminBankLogoResponse, form: NgForm): void {
    if (form.invalid || this.busy() !== null) {
      return;
    }
    this.forms.set(item.code, form);
    const sourceUrl = String(form.value[SOURCE_CONTROL]).trim();
    this.write(item.code, sourceUrl, item.version, false);
  }

  protected add(form: NgForm): void {
    this.addError.set(null);
    if (form.invalid || this.busy() !== null) {
      return;
    }
    const code = this.newCode.trim();
    if (this.items().some((item) => item.code === code)) {
      const control = form.controls[CODE_CONTROL];
      control?.setErrors({
        server: $localize`:@@admin.bankLogos.add.exists:Banka ${code}:code: už logo má. Adresu změňte v jejím řádku výše.`,
      });
      control?.markAsTouched();
      return;
    }
    this.write(code, this.newSource.trim(), null, true);
  }

  protected refresh(item: AdminBankLogoResponse): void {
    if (this.busy() !== null) {
      return;
    }
    this.clearRowError(item.code);
    this.busy.set({ code: item.code, action: 'refresh' });
    this.api
      .refreshBankLogo(item.code)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (answer) => {
          this.busy.set(null);
          this.replace(answer);
          this.bankNames.forgetLogos();
          this.announce(
            answer.imageId === item.imageId
              ? $localize`:@@admin.bankLogos.refresh.same:Logo banky ${item.code}:code: jsme stáhli znovu. Obrázek se nezměnil.`
              : $localize`:@@admin.bankLogos.refresh.changed:Logo banky ${item.code}:code: jsme stáhli znovu. Obrázek je nový.`,
          );
        },
        error: (failure: unknown) => {
          this.busy.set(null);
          this.refused(item.code, failure, undefined);
        },
      });
  }

  protected askToRemove(item: AdminBankLogoResponse): void {
    this.removeError.set(null);
    this.removing.set(item);
  }

  protected closeRemove(): void {
    if (this.busy()?.action === 'remove') {
      return;
    }
    const code = this.removing()?.code;
    this.removing.set(null);
    if (code !== undefined) {
      this.focusAfterRender(() => this.removeOpener(code));
    }
  }

  protected remove(): void {
    const item = this.removing();
    if (item === null || this.busy() !== null) {
      return;
    }
    this.removeError.set(null);
    this.busy.set({ code: item.code, action: 'remove' });
    this.api
      .removeBankLogo(item.code, item.version, item)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busy.set(null);
          this.removing.set(null);
          this.items.update((items) => items.filter((each) => each.code !== item.code));
          this.forms.delete(item.code);
          this.bankNames.forgetLogos();
          this.announce(
            $localize`:@@admin.bankLogos.remove.done:Logo banky ${item.code}:code: jsme odebrali. U jejích účtů se teď ukazuje zkratka názvu.`,
          );
          this.focusAfterRender(() => this.noticeElement());
        },
        error: (failure: unknown) => {
          this.busy.set(null);
          if (isChangedMeanwhile(failure)) {
            this.removing.set(null);
            this.stale.set({ code: item.code, sourceUrl: null, version: null, fromAddForm: false });
            return;
          }
          if (problemTypeEndsWith(failure, LOGO_NOT_FOUND)) {
            this.removing.set(null);
            this.gone(item.code, failure);
            return;
          }
          this.removeError.set(
            describeProblem(
              failure,
              $localize`:@@admin.bankLogos.remove.failed:Logo se nepodařilo odebrat. Zkuste to prosím znovu.`,
            ),
          );
        },
      });
  }

  protected overwrite(): void {
    const stale = this.stale();
    if (stale === null || stale.sourceUrl === null || stale.version === null) {
      return;
    }
    this.write(stale.code, stale.sourceUrl, stale.version, stale.fromAddForm);
  }

  protected keepDraft(): void {
    this.stale.set(null);
  }

  protected reloadAfterChange(): void {
    const stale = this.stale();
    this.stale.set(null);
    if (stale?.fromAddForm) {
      this.newCode = '';
      this.newSource = '';
    }
    this.load(() => {
      this.announce(
        $localize`:@@admin.bankLogos.reloaded:Načetli jsme aktuální loga bank. Zkontrolujte je a rozhodněte znovu.`,
      );
      this.focusRowOrNotice(stale?.code);
    });
  }

  protected rowError(code: string): string | null {
    return this.rowErrors()[code] ?? null;
  }

  protected sourceId(code: string): string {
    return `bank-logo-source-${code}`;
  }

  protected removeId(code: string): string {
    return `bank-logo-remove-${code}`;
  }

  protected titleId(code: string): string {
    return `bank-title-${code}`;
  }

  protected sourceLabel(item: AdminBankLogoResponse): string {
    const bank = this.bankName(item);
    return $localize`:@@admin.bankLogos.source.label:Adresa loga ${item.code}:code: · ${bank}:bank:`;
  }

  private write(
    code: string,
    sourceUrl: string,
    version: string | null,
    fromAddForm: boolean,
  ): void {
    this.clearRowError(code);
    const shown = this.items().find((item) => item.code === code);
    const previous = shown?.sourceUrl;
    const held = shown !== undefined && shown.version === version ? shown : null;
    this.busy.set({ code, action: fromAddForm ? 'add' : 'save' });
    this.request(this.api.setBankLogoSource(code, sourceUrl, version, held)).subscribe({
      next: (answer) => {
        this.busy.set(null);
        this.stale.set(null);
        const created = !this.items().some((item) => item.code === answer.code);
        if (created) {
          this.items.update((items) =>
            [...items, answer].sort((a, b) => a.code.localeCompare(b.code)),
          );
        } else {
          this.replace(answer);
          this.forms.get(answer.code)?.resetForm({ [SOURCE_CONTROL]: answer.sourceUrl });
        }
        if (fromAddForm) {
          this.newCode = '';
          this.newSource = '';
          this.addForm()?.resetForm({ code: '', sourceUrl: '' });
        }
        this.bankNames.forgetLogos();
        this.announce(this.savedLine(code, created || fromAddForm, previous === sourceUrl));
      },
      error: (failure: unknown) => {
        this.busy.set(null);
        if (isChangedMeanwhile(failure)) {
          const newer = versionInRefusal(failure);
          this.stale.set({
            code,
            sourceUrl: newer === null ? null : sourceUrl,
            version: newer,
            fromAddForm,
          });
          return;
        }
        this.stale.set(null);
        this.refused(
          code,
          failure,
          fromAddForm ? this.addForm() : this.forms.get(code),
          fromAddForm,
        );
      },
    });
  }

  private refused(
    code: string,
    failure: unknown,
    form: NgForm | undefined,
    fromAddForm = false,
  ): void {
    if (problemTypeEndsWith(failure, LOGO_NOT_FOUND)) {
      this.gone(code, failure);
      return;
    }
    const text = describeProblem(
      failure,
      $localize`:@@admin.bankLogos.failed:Logo se nepodařilo stáhnout. Zkuste to prosím znovu.`,
    );
    const control = form?.controls[SOURCE_CONTROL];
    if (problemTypeEndsWith(failure, SOURCE_INVALID) && control !== undefined) {
      control.setErrors({ server: text });
      control.markAsTouched();
    } else if (fromAddForm) {
      this.addError.set(text);
    } else {
      this.rowErrors.update((errors) => ({ ...errors, [code]: text }));
    }
  }

  private savedLine(code: string, created: boolean, unchanged: boolean): string {
    if (created) {
      return $localize`:@@admin.bankLogos.add.done:Logo banky ${code}:code: jsme stáhli a uložili.`;
    }
    return unchanged
      ? $localize`:@@admin.bankLogos.save.unchanged:Logo banky ${code}:code: jsme znovu stáhli a uložili.`
      : $localize`:@@admin.bankLogos.save.done:Logo banky ${code}:code: jsme stáhli z nové adresy a uložili.`;
  }

  private gone(code: string, failure: unknown): void {
    this.notice.set({
      kind: 'alert',
      text: describeProblem(
        failure,
        $localize`:@@admin.bankLogos.notFound:Logo banky mezitím někdo odebral.`,
      ),
    });
    this.load(() => this.focusRowOrNotice(code));
  }

  private focusRowOrNotice(code: string | undefined): void {
    this.focusAfterRender(() => {
      const field =
        code === undefined
          ? null
          : this.host.nativeElement.querySelector<HTMLElement>(`#${this.sourceId(code)}`);
      return field ?? this.noticeElement();
    });
  }

  private request<T>(call: Observable<T>): Observable<T> {
    return call.pipe(takeUntilDestroyed(this.destroyRef));
  }

  private replace(answer: AdminBankLogoResponse): void {
    this.items.update((items) => items.map((item) => (item.code === answer.code ? answer : item)));
  }

  private clearRowError(code: string): void {
    this.rowErrors.update((errors) => {
      const rest = { ...errors };
      delete rest[code];
      return rest;
    });
  }

  private announce(text: string): void {
    this.notice.set({ kind: 'status', text });
  }

  private removeOpener(code: string): HTMLElement | null {
    return this.host.nativeElement.querySelector<HTMLElement>(`#${this.removeId(code)}`);
  }

  private noticeElement(): HTMLElement | null {
    return (this.noticeRegion()?.nativeElement as HTMLElement | undefined) ?? null;
  }

  private focusAfterRender(target: () => HTMLElement | null): void {
    afterNextRender(() => target()?.focus(), { injector: this.injector });
  }

  private sendToSignIn(): void {
    const returnTo = this.router.url;
    this.auth.logout().subscribe(() => {
      this.router.navigateByUrl('/');
      this.loginDialog.open('login', { returnTo });
    });
  }
}
