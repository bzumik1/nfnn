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
import { AuthStore } from '../../../../core/auth/auth-store';
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

interface EditedFrom {
  readonly version: string;
  readonly held: ProfileFields | null;
}

interface NewerProfile {
  readonly version: string;
  readonly stored: ProfileFields | null;
}

const LOCALE_LABELS: Record<DonorLocale, string> = {
  cs: $localize`:@@donor.profile.locale.cs:čeština`,
  en: $localize`:@@donor.profile.locale.en:angličtina (dvojjazyčné)`,
};

const UNAUTHENTICATED = 'auth/unauthenticated';
const STORED_PROFILE_LOADED = $localize`:@@donor.profile.changed.loaded:Načetli jsme uložený profil. Vaše úpravy jsme zahodili.`;
const STORED_PROFILE_FAILED = $localize`:@@donor.profile.changed.loadFailed:Uložený profil se nepodařilo načíst. Zkuste to prosím znovu.`;
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
  }

  protected saveOverNewer(form: NgForm): void {
    const newer = this.newerVersion();
    if (newer === null || this.editedFrom === null) {
      return;
    }
    this.editedFrom = { version: newer.version, held: newer.stored };
    this.newerVersion.set(null);
    this.draft.overwriteConfirmed();
    this.save(form);
  }

  protected loadStored(): void {
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
        this.draftStatus.set(STORED_PROFILE_LOADED);
        this.close();
      },
      error: (failure: unknown) => {
        this.loadingStored.set(false);
        if (problemTypeEndsWith(failure, UNAUTHENTICATED) || this.auth.status() === 'anonymous') {
          this.sessionEnded.emit();
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
    this.confirmingStale.set(false);
    this.newerVersion.set(null);
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
    this.saving.set(true);
    this.error.set('');
    this.newerVersion.set(null);
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
          if (problemTypeEndsWith(failure, UNAUTHENTICATED) || this.auth.status() === 'anonymous') {
            this.sessionEnded.emit();
            return;
          }
          const newer = isChangedMeanwhile(failure) ? versionInRefusal(failure) : null;
          if (newer !== null) {
            this.newerVersion.set({ version: newer, stored: storedProfileIn(failure) });
            return;
          }
          this.refuse(form, failure);
        },
      });
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
    this.editedFrom = donor === null ? null : { version: donor.version, held: fieldsOf(donor) };
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

function storedProfileIn(failure: unknown): ProfileFields | null {
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
