/// <reference types="@angular/localize" />

import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import {
  describeProblemWithoutFields,
  problemOf,
  problemTypeEndsWith,
} from '../../../../core/auth/api-problem';
import { StoredProfile, storedProfileOf } from '../../../../core/auth/auth-api';
import { AuthStore } from '../../../../core/auth/auth-store';
import { Connectivity } from '../../../../core/connectivity/connectivity';
import { Donor, DonorLocale } from '../../../../core/auth/donor';
import { FocusFirstInvalid } from '../../../../shared/ui/form-field/focus-first-invalid';
import { FormControlDirective } from '../../../../shared/ui/form-field/form-control';
import { FormField } from '../../../../shared/ui/form-field/form-field';
import { placeServerErrors } from '../../../../shared/ui/form-field/server-errors';
import { PrintableOnReceiptValidator } from '../../printable-on-receipt';
import {
  CITY_MESSAGES,
  COMPANY_NAME_MESSAGES,
  PERSON_NAME_MESSAGES,
  POSTAL_CODE_MESSAGES,
  STREET_MESSAGES,
} from '../../donor-field-messages';
import { NeedsConnection } from '../../../../shared/ui/needs-connection/needs-connection';
import { formDraft } from '../../../../core/drafts/form-draft';
import {
  DRAFT_DISCARDED_TEXT,
  DRAFT_RESUMED_TEXT,
  DraftOffer,
} from '../../../../shared/ui/draft-offer/draft-offer';
import { formatBankTime } from '../../../donations/donation-date';
import {
  currentInRefusal,
  isChangedMeanwhile,
  versionInRefusal,
} from '../../../../core/version/row-version';

interface ProfileFields {
  name: string;
  street: string;
  city: string;
  postalCode: string;
  preferredLocale: DonorLocale;
}

type ProfileField = keyof ProfileFields;

const PROFILE_FIELD_NAMES: readonly ProfileField[] = [
  'name',
  'street',
  'city',
  'postalCode',
  'preferredLocale',
];

interface EditedFrom {
  readonly donorId: string;
  readonly version: string;
  readonly held: StoredProfile | null;
}

interface NewerProfile {
  readonly merged: boolean;
  readonly bothChanged: readonly ProfileField[];
}

const LOCALE_LABELS: Record<DonorLocale, string> = {
  cs: $localize`:@@donor.profile.locale.cs:čeština`,
  en: $localize`:@@donor.profile.locale.en:angličtina (dvojjazyčné)`,
};

const UNAUTHENTICATED = 'auth/unauthenticated';
const STORED_PROFILE_LOADED = $localize`:@@donor.profile.changed.loaded:Vaše úpravy jsme zahodili a načetli uložené údaje.`;
const STORED_PROFILE_FAILED = $localize`:@@donor.profile.changed.loadFailed:Uložené údaje se nepodařilo načíst. Zkuste to prosím znovu.`;
const EDIT_CANCELLED_AND_LOADED = $localize`:@@donor.profile.changed.cancelled:Úpravy jsme zrušili a načetli uložené údaje.`;
const ACCOUNT_CHANGED = $localize`:@@donor.profile.accountChanged:V tomto okně je teď přihlášený jiný účet. Rozepsané úpravy jsme zahodili, nic jsme neuložili.`;
const MERGED_TEXT = $localize`:@@donor.profile.changed.merged:Údaje, které jste neměnili, jsme ve formuláři doplnili tak, jak jsou uložené teď.`;
const PERSON_FIELD_NAMES: Record<ProfileField, string> = {
  name: $localize`:@@donor.profile.changed.field.personName:jméno a příjmení`,
  street: $localize`:@@donor.profile.changed.field.street:ulice a číslo`,
  city: $localize`:@@donor.profile.changed.field.city:město`,
  postalCode: $localize`:@@donor.profile.changed.field.postalCode:PSČ`,
  preferredLocale: $localize`:@@donor.profile.changed.field.locale:jazyk potvrzení`,
};
const COMPANY_FIELD_NAMES: Record<ProfileField, string> = {
  ...PERSON_FIELD_NAMES,
  name: $localize`:@@donor.profile.changed.field.companyName:název firmy`,
  street: $localize`:@@donor.profile.changed.field.companyStreet:sídlo`,
};
const PROFILE_FIELDS: Readonly<Record<string, string>> = {
  name: 'name',
  'address.street': 'street',
  'address.city': 'city',
  'address.postalCode': 'postalCode',
  preferredLocale: 'preferredLocale',
};

@Component({
  selector: 'app-profile-card',
  imports: [
    FormsModule,
    FormField,
    FormControlDirective,
    FocusFirstInvalid,
    PrintableOnReceiptValidator,
    NeedsConnection,
    DraftOffer,
  ],
  templateUrl: './profile-card.html',
  styleUrl: './profile-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileCard {
  private readonly auth = inject(AuthStore);
  private readonly connectivity = inject(Connectivity);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  readonly sessionEnded = output<void>();

  private readonly editButton = viewChild<ElementRef<HTMLButtonElement>>('editButton');
  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');
  private readonly profileForm = viewChild<NgForm>('profile');

  protected readonly donor = this.auth.donor;
  protected readonly company = computed(() => this.donor()?.type === 'COMPANY');
  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly error = signal('');
  protected readonly draftStatus = signal<string | null>(null);
  protected readonly confirmingStale = signal(false);
  protected readonly newerVersion = signal<NewerProfile | null>(null);
  protected readonly loadingStored = signal(false);
  protected readonly newerNotice = computed(() => {
    const newer = this.newerVersion();
    if (newer === null || !newer.merged) {
      return null;
    }
    if (newer.bothChanged.length === 0) {
      return MERGED_TEXT;
    }
    const names = this.company() ? COMPANY_FIELD_NAMES : PERSON_FIELD_NAMES;
    const fields = newer.bothChanged.map((field) => names[field]).join(', ');
    return $localize`:@@donor.profile.changed.conflicts:Mezitím se jinak uložilo i to, co jste změnili: ${fields}:fields:. Ve formuláři zůstávají vaše hodnoty, ostatní údaje jsou doplněné tak, jak jsou uložené teď.`;
  });
  private editedFrom: EditedFrom | null = null;
  protected readonly localeLabels = LOCALE_LABELS;

  protected fields: ProfileFields = fieldsOf(null);
  protected readonly draft = formDraft<ProfileFields>({
    copy: 'donor',
    key: () => (this.donor() === null ? null : 'profile'),
    values: () => (this.editing() ? { ...this.fields } : fieldsOf(this.donor())),
    apply: (values) => {
      this.startFrom(this.donor());
      this.fields = { ...values };
      this.error.set('');
      this.saved.set(false);
      this.editing.set(true);
      afterNextRender(
        () => {
          this.profileForm()?.form.markAsDirty();
          this.nameInput()?.nativeElement.focus();
        },
        { injector: this.injector },
      );
    },
    changedFieldsOnly: true,
  });

  constructor() {
    effect(() => {
      const donor = this.donor();
      if (donor !== null && !untracked(this.editing)) {
        untracked(() => this.draft.ready(donor.version));
      }
    });
    effect(() => {
      const donorId = this.donor()?.id ?? null;
      untracked(() => {
        if (this.editing() && this.editedFrom !== null && this.editedFrom.donorId !== donorId) {
          this.leaveForAnotherAccount(donorId);
        }
      });
    });
  }

  protected readonly nameMessages = computed(() =>
    this.company() ? COMPANY_NAME_MESSAGES : PERSON_NAME_MESSAGES,
  );
  protected readonly streetMessages = STREET_MESSAGES;
  protected readonly cityMessages = CITY_MESSAGES;
  protected readonly postalCodeMessages = POSTAL_CODE_MESSAGES;

  protected address(donor: Donor): string {
    return `${donor.address.street}, ${donor.address.postalCode} ${donor.address.city}`;
  }

  protected draftSavedAt(savedAt: string): string {
    return formatBankTime(savedAt);
  }

  protected resumeDraft(): void {
    this.draft.resume();
    this.draftStatus.set(DRAFT_RESUMED_TEXT);
  }

  protected discardDraft(): void {
    this.draft.discard();
    this.draftStatus.set(DRAFT_DISCARDED_TEXT);
    afterNextRender(
      () => (this.editing() ? this.nameInput() : this.editButton())?.nativeElement.focus(),
      { injector: this.injector },
    );
  }

  protected keepEdits(form: NgForm): void {
    this.confirmingStale.set(false);
    this.draft.overwriteConfirmed();
    this.startFrom(this.donor());
    this.save(form);
    this.focusSave();
  }

  protected saveOverNewer(form: NgForm): void {
    if (this.newerVersion() === null || this.editedFrom === null) {
      return;
    }
    this.newerVersion.set(null);
    this.draft.overwriteConfirmed();
    this.save(form);
    this.focusSave();
  }

  protected loadStored(loaded: string = STORED_PROFILE_LOADED): void {
    if (this.loadingStored()) {
      return;
    }
    this.loadingStored.set(true);
    this.error.set('');
    this.auth.reloadStoredProfile().subscribe({
      next: () => {
        this.loadingStored.set(false);
        this.newerVersion.set(null);
        this.draft.discard();
        this.saved.set(false);
        this.draftStatus.set(loaded);
        this.close();
      },
      error: (failure: unknown) => {
        this.loadingStored.set(false);
        if (this.endsSession(failure)) {
          return;
        }
        this.error.set(describeProblemWithoutFields(failure, STORED_PROFILE_FAILED));
      },
    });
  }

  protected dropEdits(): void {
    this.confirmingStale.set(false);
    this.draft.discard();
    this.draftStatus.set(DRAFT_DISCARDED_TEXT);
    this.close();
  }

  edit(): void {
    this.startFrom(this.donor());
    this.fields = fieldsOf(this.donor());
    this.error.set('');
    this.saved.set(false);
    this.draftStatus.set(null);
    this.editing.set(true);
    afterNextRender(() => this.nameInput()?.nativeElement.focus(), { injector: this.injector });
  }

  cancel(): void {
    if (this.newerVersion() !== null && !this.connectivity.offline()) {
      this.loadStored(EDIT_CANCELLED_AND_LOADED);
      return;
    }
    this.confirmingStale.set(false);
    this.draft.discard();
    this.close();
  }

  save(form: NgForm): void {
    if (form.invalid || this.saving()) {
      return;
    }
    if (this.draft.resumedStale()) {
      this.confirmingStale.set(true);
      return;
    }
    const from = this.editedFrom ?? this.startFrom(this.donor());
    if (from === null) {
      return;
    }
    if (from.donorId !== this.donor()?.id) {
      this.leaveForAnotherAccount(this.donor()?.id ?? null);
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.newerVersion.set(null);
    if (from.version === '') {
      this.saveOverStored(form, from);
      return;
    }
    this.send(form, from);
  }

  private saveOverStored(form: NgForm, from: EditedFrom): void {
    this.auth.reloadStoredProfile().subscribe({
      next: (donor) => {
        if (this.editedFrom !== from || donor.id !== from.donorId) {
          this.saving.set(false);
          return;
        }
        const newer = this.adoptNewer(donor.version, storedProfileOf(donor));
        if (newer.bothChanged.length > 0) {
          this.saving.set(false);
          this.newerVersion.set(newer);
          this.focusNewerIfFocusWasLost();
          return;
        }
        this.send(form, this.editedFrom);
      },
      error: (failure: unknown) => {
        this.saving.set(false);
        if (this.endsSession(failure)) {
          return;
        }
        this.error.set(describeProblemWithoutFields(failure, STORED_PROFILE_FAILED));
      },
    });
  }

  private send(form: NgForm, from: EditedFrom): void {
    this.auth
      .updateProfile(
        {
          name: this.fields.name.trim(),
          address: {
            street: this.fields.street.trim(),
            city: this.fields.city.trim(),
            postalCode: this.fields.postalCode.trim(),
          },
          preferredLocale: this.fields.preferredLocale,
        },
        from.version,
        from.held,
      )
      .subscribe({
        next: (donor) => {
          this.saving.set(false);
          this.saved.set(true);
          this.draftStatus.set(null);
          this.close();
          this.draft.saved(donor.version);
        },
        error: (failure: unknown) => {
          this.saving.set(false);
          if (this.endsSession(failure) || this.editedFrom !== from) {
            return;
          }
          const newer = isChangedMeanwhile(failure) ? versionInRefusal(failure) : null;
          if (newer !== null) {
            this.newerVersion.set(this.adoptNewer(newer, storedProfileIn(failure)));
            this.focusNewerIfFocusWasLost();
            return;
          }
          this.refuse(form, failure);
        },
      });
  }

  private adoptNewer(version: string, stored: StoredProfile | null): NewerProfile {
    const from = this.editedFrom;
    if (from === null) {
      return { merged: false, bothChanged: [] };
    }
    this.editedFrom = { donorId: from.donorId, version, held: stored };
    if (stored === null || from.held === null) {
      return { merged: false, bothChanged: [] };
    }
    const held = from.held;
    const merged = { ...this.fields };
    const bothChanged: ProfileField[] = [];
    for (const field of PROFILE_FIELD_NAMES) {
      if (merged[field] === held[field]) {
        Object.assign(merged, { [field]: stored[field] });
      } else if (stored[field] !== held[field] && stored[field] !== merged[field]) {
        bothChanged.push(field);
      }
    }
    this.fields = merged;
    return { merged: true, bothChanged };
  }

  private endsSession(failure: unknown): boolean {
    if (problemTypeEndsWith(failure, UNAUTHENTICATED) || this.auth.status() === 'anonymous') {
      this.sessionEnded.emit();
      return true;
    }
    return false;
  }

  private leaveForAnotherAccount(donorId: string | null): void {
    this.confirmingStale.set(false);
    this.saving.set(false);
    this.loadingStored.set(false);
    this.error.set('');
    this.saved.set(false);
    this.fields = fieldsOf(this.donor());
    if (donorId !== null) {
      this.draftStatus.set(ACCOUNT_CHANGED);
    }
    this.close();
  }

  private focusSave(): void {
    afterNextRender(() => this.host.querySelector<HTMLButtonElement>('.profile-save')?.focus(), {
      injector: this.injector,
    });
  }

  private focusNewerIfFocusWasLost(): void {
    afterNextRender(
      () => {
        const focused = this.host.ownerDocument.activeElement;
        if (focused === null || focused === this.host.ownerDocument.body) {
          this.host.querySelector<HTMLButtonElement>('.profile-changed-keep')?.focus();
        }
      },
      { injector: this.injector },
    );
  }

  private refuse(form: NgForm, failure: unknown): void {
    const errors = problemOf(failure)?.errors ?? [];
    const unplaced = placeServerErrors(form, errors, PROFILE_FIELDS);
    const generic = $localize`:@@donor.profile.error.generic:Údaje se nepodařilo uložit. Zkuste to prosím znovu.`;
    this.error.set(
      [describeProblemWithoutFields(failure, generic), ...unplaced.map((error) => error.message)]
        .filter((part) => part !== '')
        .join(' '),
    );
    if (unplaced.length < errors.length) {
      afterNextRender(
        () => this.host.querySelector<HTMLElement>('.profile-form .ng-invalid[id]')?.focus(),
        { injector: this.injector },
      );
    }
  }

  private startFrom(donor: Donor | null): EditedFrom | null {
    this.editedFrom =
      donor === null
        ? null
        : { donorId: donor.id, version: donor.version, held: storedProfileOf(donor) };
    return this.editedFrom;
  }

  private close(): void {
    this.editedFrom = null;
    this.newerVersion.set(null);
    this.editing.set(false);
    afterNextRender(() => this.editButton()?.nativeElement.focus(), { injector: this.injector });
  }
}

function fieldsOf(donor: Donor | null): ProfileFields {
  return {
    name: donor?.name ?? '',
    street: donor?.address.street ?? '',
    city: donor?.address.city ?? '',
    postalCode: donor?.address.postalCode ?? '',
    preferredLocale: donor?.preferredLocale ?? 'cs',
  };
}

function storedProfileIn(failure: unknown): StoredProfile | null {
  const stored = currentInRefusal(failure);
  if (stored === null) {
    return null;
  }
  const { name, street, city, postalCode, preferredLocale } = stored;
  return typeof name === 'string' &&
    typeof street === 'string' &&
    typeof city === 'string' &&
    typeof postalCode === 'string' &&
    (preferredLocale === 'cs' || preferredLocale === 'en')
    ? { name, street, city, postalCode, preferredLocale }
    : null;
}
