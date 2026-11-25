/// <reference types="@angular/localize" />

import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injectable,
  Injector,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Observable, finalize, from, map, of, switchMap } from 'rxjs';
import { describeProblem, problemTypeEndsWith } from '../../../../core/auth/api-problem';
import { LoadFailure } from '../../../../shared/ui/load-failure/load-failure';
import { AuthApi } from '../../../../core/auth/auth-api';
import { AuthStore } from '../../../../core/auth/auth-store';
import { Confirmation, Passkey } from '../../../../core/auth/donor';
import {
  PasskeyAuthenticator,
  PasskeyCeremonyError,
  PasskeyFailure,
} from '../../../../core/auth/passkey-authenticator';
import { deviceName } from '../../../../core/auth/device-name';
import { deviceAccountOf, SESSION_DEVICE } from '../../../../core/auth/session-device';
import {
  afterRemoval,
  FocusAfterRowLeaves,
  leaveWithClass,
  markRowsLeaving,
  neighbourAfterRowLeaves,
} from '../../../../shared/ui/leaving-row/leaving-row';
import { formatDonationDate } from '../../../donations/donation-date';
import { BusyButton } from '../../../../shared/ui/busy-button/busy-button';
import { BusyAnnouncement } from '../../../../shared/ui/busy-label/busy-announcement';
import { FocusFirstInvalid } from '../../../../shared/ui/form-field/focus-first-invalid';
import { FormControlDirective } from '../../../../shared/ui/form-field/form-control';
import { FormField } from '../../../../shared/ui/form-field/form-field';
import { AccountUsername } from '../../../../shared/ui/account-username/account-username';
import { PasswordReveal } from '../../../../shared/ui/password-reveal/password-reveal';
import { BusyLabel } from '../../../../shared/ui/busy-label/busy-label';
import { NeedsConnection } from '../../../../shared/ui/needs-connection/needs-connection';
import { ListChanges } from '../../../../core/kept/list-changes';
import { KeptDonorAnswers } from '../kept-donor-answers';
import { Disclosure } from '../../../../shared/ui/disclosure/disclosure';

const UNAUTHENTICATED = 'auth/unauthenticated';
const PASSKEY_NAME_MAX_LENGTH = 64;
const RENAME_BUTTONS = '[id^="passkey-rename-button-"]';
const EMPTY_TEXT_BEHIND_LEAVING_ROW = 'passkeys-empty--behind-leaving-row';
const HELD_EMPTY_TEXT_INLINE_SIZE = '--passkeys-held-empty-text-inline-size';
const ROOM_FOR_EMPTY_TEXT = '--passkeys-room-for-empty-text';

export interface LaidOutBox {
  readonly width: number;
  readonly height: number;
  readonly marginBottom: number;
}

@Injectable({ providedIn: 'root' })
export class LaidOutBoxes {
  of(element: HTMLElement): LaidOutBox {
    const { width, height } = element.getBoundingClientRect();
    const marginBottom = Number.parseFloat(getComputedStyle(element).marginBottom) || 0;
    return { width, height, marginBottom };
  }
}

export function keepRoomForEmptyText(
  list: HTMLElement,
  emptyText: HTMLElement,
  boxes: LaidOutBoxes,
): void {
  const listBox = boxes.of(list);
  emptyText.style.setProperty(HELD_EMPTY_TEXT_INLINE_SIZE, `${listBox.width}px`);
  const emptyTextBox = boxes.of(emptyText);
  const room = emptyTextBox.height + emptyTextBox.marginBottom - listBox.marginBottom;
  list.style.setProperty(ROOM_FOR_EMPTY_TEXT, `${Math.max(0, room)}px`);
}

@Component({
  selector: 'app-passkeys-panel',
  providers: [BusyAnnouncement],
  imports: [
    LoadFailure,
    BusyButton,
    BusyLabel,
    Disclosure,
    FormsModule,
    FormField,
    FormControlDirective,
    FocusFirstInvalid,
    PasswordReveal,
    AccountUsername,
    NeedsConnection,
  ],
  templateUrl: './passkeys-panel.html',
  styleUrl: './passkeys-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PasskeysPanel {
  protected readonly busyAnnouncement = inject(BusyAnnouncement);
  private readonly auth = inject(AuthStore);
  private readonly authApi = inject(AuthApi);
  private readonly kept = inject(KeptDonorAnswers);
  private readonly changes = new ListChanges(() => this.load(false, true));
  private readonly authenticator = inject(PasskeyAuthenticator);
  private readonly device = inject(SESSION_DEVICE);
  private readonly document = inject(DOCUMENT);
  private prfInput: Uint8Array<ArrayBuffer> | null = null;
  private readonly injector = inject(Injector);
  private readonly boxes = inject(LaidOutBoxes);

  readonly labelledBy = input<string | null>(null);
  readonly sessionEnded = output<void>();
  readonly countChanged = output<number>();
  readonly countUnknown = output<void>();

  private readonly region = viewChild<ElementRef<HTMLElement>>('region');
  private readonly addButton = viewChild<ElementRef<HTMLButtonElement>>('addButton');
  private readonly nameField = viewChild<ElementRef<HTMLInputElement>>('nameField');
  private readonly renameField = viewChild<ElementRef<HTMLInputElement>>('renameField');
  private readonly passkeyList = viewChild<ElementRef<HTMLElement>>('passkeyList');
  private readonly emptyText = viewChild<ElementRef<HTMLElement>>('emptyText');

  protected readonly supported = this.authenticator.supported();
  protected readonly passkeys = signal<Passkey[] | null>(null);
  protected readonly hasPassword = computed(() => this.auth.donor()?.hasPassword ?? true);
  protected readonly accountEmail = computed(() => this.auth.donor()?.email ?? '');
  protected readonly confirmation = computed<'password' | 'passkey' | 'none'>(() => {
    if (this.hasPassword()) {
      return 'password';
    }
    return (this.passkeys()?.length ?? 0) > 0 ? 'passkey' : 'none';
  });
  protected readonly lastSignInMethod = computed(
    () => !this.hasPassword() && (this.passkeys()?.length ?? 0) <= 1,
  );
  protected readonly withoutSignInMethod = computed(
    () => !this.hasPassword() && this.passkeys()?.length === 0,
  );
  protected readonly loadError = signal('');
  protected readonly retrying = signal(false);
  protected readonly adding = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly confirming = signal<string | null>(null);
  protected readonly removing = signal<string | null>(null);
  protected readonly renaming = signal<string | null>(null);
  protected readonly renameSaving = signal(false);
  protected readonly renameError = signal('');
  protected readonly status = signal('');
  protected readonly added = signal<string | null>(null);
  protected readonly rowLeft = signal(false);
  private readonly rowsStillLeaving = signal(0);
  protected readonly emptyTextBehindLeavingRow = computed(() => this.rowsStillLeaving() > 0);
  protected readonly rowLeaves = leaveWithClass('passkey-slot--leaving', {
    left: (row) => this.focusAfterRowLeaves.rowLeaveEnded(row),
  });
  private readonly focusAfterRowLeaves = new FocusAfterRowLeaves(
    this.document,
    () => this.region()?.nativeElement ?? null,
  );
  protected readonly nameMaxLength = PASSKEY_NAME_MAX_LENGTH;

  protected readonly nameHint = $localize`:@@donor.passkeys.name.hint:Podle názvu klíč později poznáte, třeba „iPhone“ nebo „Pracovní notebook“.`;
  protected readonly nameMessages = {
    required: $localize`:@@donor.passkeys.name.required:Pojmenujte prosím klíč.`,
  };
  protected readonly passwordMessages = {
    required: $localize`:@@donor.passkeys.password.required:Zadejte prosím své heslo.`,
  };

  protected name = '';
  protected password = '';
  protected newName = '';

  constructor() {
    this.load(true);
    effect(() => {
      const list = this.passkeys();
      if (list !== null) {
        this.countChanged.emit(list.length);
        this.kept.keep('passkeys', { items: list });
      }
    });
  }

  load(shownBefore = false, quietly = false): void {
    this.loadError.set('');
    this.fetch(shownBefore, quietly);
  }

  protected retry(): void {
    this.retrying.set(true);
    this.fetch(false, false);
  }

  private fetch(shownBefore: boolean, quietly: boolean): void {
    const server = this.changes.track(this.authApi.passkeys());
    const passkeys = shownBefore ? this.kept.read('passkeys', server) : server;
    passkeys.pipe(finalize(() => this.retrying.set(false))).subscribe({
      next: (list) => {
        if (this.retrying()) {
          this.loadError.set('');
        }
        this.passkeys.set(list.items);
      },
      error: (failure: unknown) => {
        if (this.sessionLost(failure) || (quietly && this.passkeys() !== null)) {
          return;
        }
        if (this.passkeys() === null) {
          this.countUnknown.emit();
        }
        this.loadError.set(
          describeProblem(
            failure,
            $localize`:@@donor.passkeys.error.load:Přístupové klíče se nepodařilo načíst.`,
          ),
        );
      },
    });
  }

  focusTarget(): HTMLElement | null {
    return this.region()?.nativeElement ?? null;
  }

  collapse(): void {
    this.adding.set(false);
    this.confirming.set(null);
    this.renaming.set(null);
    this.name = '';
    this.password = '';
    this.newName = '';
    this.error.set('');
    this.renameError.set('');
    this.status.set('');
  }

  openForm(): void {
    this.status.set('');
    this.error.set('');
    this.confirming.set(null);
    this.renaming.set(null);
    this.name = deviceName(this.document);
    this.password = '';
    void this.device.prfInput().then((input) => (this.prfInput = input));
    this.adding.set(true);
    afterNextRender(() => this.nameField()?.nativeElement.focus(), { injector: this.injector });
  }

  cancel(): void {
    this.closeForm();
  }

  add(form: NgForm): void {
    if (form.invalid || this.saving()) {
      return;
    }
    const name = this.name.trim();
    this.changes.changing();
    this.saving.set(true);
    this.error.set('');
    this.confirm()
      .pipe(
        switchMap((confirmation) => this.authApi.passkeyCreationOptions(confirmation)),
        switchMap((options) =>
          from(this.authenticator.createWithPrf(options, this.prfInput)).pipe(
            switchMap(({ credential, prf }) => {
              let handedOver = false;
              return this.authApi.addPasskey(options.challenge, name, credential).pipe(
                map((passkey) => {
                  const donor = this.auth.donor();
                  if (prf !== null && donor !== null) {
                    handedOver = true;
                    void this.device.passkeyAdded(deviceAccountOf(donor), prf);
                  }
                  return passkey;
                }),
                finalize(() => {
                  if (!handedOver) {
                    prf?.output.fill(0);
                  }
                }),
              );
            }),
          ),
        ),
      )
      .subscribe({
        next: (passkey) => {
          this.saving.set(false);
          const first = (this.passkeys()?.length ?? 0) === 0;
          if (!this.listed(passkey)) {
            this.added.set(passkey.id);
            this.passkeys.update((list) => [...(list ?? []), passkey]);
          }
          this.status.set(
            first && this.hasPassword()
              ? $localize`:@@donor.passkeys.addedFirst:Přístupový klíč ${passkey.name}:name: je přidaný. Příště se jím můžete přihlásit bez hesla; heslo teď můžete u\u00a0řádku „Heslo“ i\u00a0odebrat.`
              : $localize`:@@donor.passkeys.added:Přístupový klíč ${passkey.name}:name: je přidaný. Příště se jím můžete přihlásit bez hesla.`,
          );
          this.closeForm();
          this.changes.changed();
        },
        error: (failure: unknown) => {
          this.saving.set(false);
          if (failure instanceof PasskeyCeremonyError) {
            this.error.set(ceremonyMessage(failure.reason));
            this.changes.changed();
            return;
          }
          if (this.sessionLost(failure)) {
            return;
          }
          this.changes.changed();
          this.error.set(
            describeProblem(
              failure,
              $localize`:@@donor.passkeys.error.add:Klíč se nepodařilo přidat. Zkuste to prosím znovu.`,
            ),
          );
        },
      });
  }

  askToRemove(passkey: Passkey): void {
    this.status.set('');
    this.loadError.set('');
    this.renaming.set(null);
    this.confirming.set(passkey.id);
  }

  openRename(passkey: Passkey): void {
    this.status.set('');
    this.renameError.set('');
    this.confirming.set(null);
    this.newName = passkey.name;
    this.renaming.set(passkey.id);
    afterNextRender(() => this.renameField()?.nativeElement.focus(), { injector: this.injector });
  }

  cancelRename(passkey: Passkey): void {
    this.closeRename(passkey);
  }

  rename(form: NgForm, passkey: Passkey): void {
    if (form.invalid || this.renameSaving()) {
      return;
    }
    this.changes.changing();
    this.renameSaving.set(true);
    this.renameError.set('');
    this.authApi.renamePasskey(passkey.id, this.newName.trim()).subscribe({
      next: (renamed) => {
        this.renameSaving.set(false);
        this.passkeys.update((list) =>
          (list ?? []).map((other) => (other.id === renamed.id ? renamed : other)),
        );
        this.status.set(
          $localize`:@@donor.passkeys.renamed:Přístupový klíč je přejmenovaný na ${renamed.name}:name:.`,
        );
        this.closeRename(passkey);
        this.changes.changed();
      },
      error: (failure: unknown) => {
        this.renameSaving.set(false);
        if (this.sessionLost(failure)) {
          return;
        }
        this.changes.changed();
        this.renameError.set(
          describeProblem(
            failure,
            $localize`:@@donor.passkeys.error.rename:Klíč se nepodařilo přejmenovat. Zkuste to prosím znovu.`,
          ),
        );
      },
    });
  }

  keep(): void {
    this.confirming.set(null);
  }

  remove(passkey: Passkey): void {
    if (this.removing() !== null) {
      return;
    }
    this.focusAfterRowLeaves.forget();
    this.changes.changing();
    this.removing.set(passkey.id);
    this.authApi.removePasskey(passkey.id).subscribe({
      next: () => {
        const row = this.document.getElementById(this.rowId(passkey));
        const neighbour = neighbourAfterRowLeaves(
          row,
          this.passkeyList()?.nativeElement.querySelectorAll<HTMLElement>(RENAME_BUTTONS) ?? [],
        );
        markRowsLeaving([row]);
        this.holdEmptyTextBehind(row);
        this.focusAfterRowLeaves.rowLeaving(row, neighbour);
        this.removing.set(null);
        this.confirming.set(null);
        this.rowLeft.set(true);
        this.passkeys.update((list) => (list ?? []).filter((other) => other.id !== passkey.id));
        this.status.set(
          $localize`:@@donor.passkeys.removed:Přístupový klíč ${passkey.name}:name: je odebraný. Tímto klíčem se už nepřihlásíte; v\u00a0zařízení ho můžete smazat.`,
        );
        afterNextRender(() => this.focusAfterRemoval(row, neighbour()), {
          injector: this.injector,
        });
        this.changes.changed();
      },
      error: (failure: unknown) => {
        this.removing.set(null);
        if (this.sessionLost(failure)) {
          return;
        }
        this.changes.changed();
        this.loadError.set(
          describeProblem(
            failure,
            $localize`:@@donor.passkeys.error.remove:Klíč se nepodařilo odebrat. Zkuste to prosím znovu.`,
          ),
        );
      },
    });
  }

  private holdEmptyTextBehind(row: HTMLElement | null): void {
    if (row === null) {
      return;
    }
    this.rowsStillLeaving.update((count) => count + 1);
    afterRemoval(row, () => this.letEmptyTextEnter(), this.region()?.nativeElement ?? null);
    const list = row.parentElement;
    afterNextRender(
      () => {
        const emptyText = this.emptyText()?.nativeElement;
        if (list !== null && emptyText !== undefined) {
          keepRoomForEmptyText(list, emptyText, this.boxes);
        }
      },
      { injector: this.injector },
    );
  }

  private letEmptyTextEnter(): void {
    this.rowsStillLeaving.update((count) => count - 1);
    if (this.rowsStillLeaving() === 0) {
      this.emptyText()?.nativeElement.classList.remove(EMPTY_TEXT_BEHIND_LEAVING_ROW);
    }
  }

  private focusAfterRemoval(row: HTMLElement | null, neighbour: HTMLElement | null): void {
    if (neighbour !== null) {
      this.focusAfterRowLeaves.moveFocus(row, neighbour);
      return;
    }
    const region = this.region()?.nativeElement;
    if (region === undefined) {
      return;
    }
    const emptyText = this.emptyText()?.nativeElement;
    this.focusAfterRowLeaves.focusInPlace(
      region,
      emptyText === undefined
        ? null
        : { row, from: emptyText, to: this.addButton()?.nativeElement ?? null },
    );
  }

  protected formatDate(isoInstant: string): string {
    return formatDonationDate(isoInstant);
  }

  private listed(passkey: Passkey): boolean {
    return this.passkeys()?.some((known) => known.id === passkey.id) ?? false;
  }

  protected rowId(passkey: Passkey): string {
    return `passkey-row-${passkey.id}`;
  }

  protected renameButtonId(passkey: Passkey): string {
    return `passkey-rename-button-${passkey.id}`;
  }

  private closeRename(passkey: Passkey): void {
    this.renaming.set(null);
    this.newName = '';
    this.renameError.set('');
    afterNextRender(() => this.document.getElementById(this.renameButtonId(passkey))?.focus(), {
      injector: this.injector,
    });
  }

  private closeForm(): void {
    this.adding.set(false);
    this.name = '';
    this.password = '';
    this.error.set('');
    afterNextRender(() => this.addButton()?.nativeElement.focus(), { injector: this.injector });
  }

  private sessionLost(failure: unknown): boolean {
    if (problemTypeEndsWith(failure, UNAUTHENTICATED) || this.auth.status() === 'anonymous') {
      this.sessionEnded.emit();
      return true;
    }
    return false;
  }

  private confirm(): Observable<Confirmation> {
    switch (this.confirmation()) {
      case 'password':
        return of({ password: this.password });
      case 'passkey':
        return this.auth.confirmWith(null);
      default:
        return of({});
    }
  }
}

function ceremonyMessage(reason: PasskeyFailure): string {
  switch (reason) {
    case 'already-registered':
      return $localize`:@@donor.passkeys.error.alreadyRegistered:Toto zařízení už přístupový klíč k\u00a0vašemu účtu má. Druhý není potřeba.`;
    case 'unsupported':
      return $localize`:@@donor.passkeys.error.unsupported:Tento prohlížeč přístupové klíče nepodporuje.`;
    case 'cancelled':
      return $localize`:@@donor.passkeys.error.cancelled:Klíč se nevytvořil, zařízení ho nepotvrdilo. Zkuste to prosím znovu.`;
    default:
      return $localize`:@@donor.passkeys.error.failed:Klíč se nevytvořil. Zkuste to prosím znovu, případně v\u00a0jiném prohlížeči.`;
  }
}
