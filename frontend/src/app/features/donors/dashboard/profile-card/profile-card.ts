/// <reference types="@angular/localize" />

import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  output,
  signal,
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

interface ProfileFields {
  name: string;
  street: string;
  city: string;
  postalCode: string;
  preferredLocale: DonorLocale;
}

const LOCALE_LABELS: Record<DonorLocale, string> = {
  cs: $localize`:@@donor.profile.locale.cs:čeština`,
  en: $localize`:@@donor.profile.locale.en:angličtina (dvojjazyčné)`,
};

const UNAUTHENTICATED = 'auth/unauthenticated';
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

  protected readonly donor = this.auth.donor;
  protected readonly company = computed(() => this.donor()?.type === 'COMPANY');
  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly error = signal('');
  protected readonly localeLabels = LOCALE_LABELS;

  protected fields: ProfileFields = fieldsOf(null);

  protected readonly nameMessages = computed(() =>
    this.company() ? COMPANY_NAME_MESSAGES : PERSON_NAME_MESSAGES,
  );
  protected readonly streetMessages = STREET_MESSAGES;
  protected readonly cityMessages = CITY_MESSAGES;
  protected readonly postalCodeMessages = POSTAL_CODE_MESSAGES;

  protected address(donor: Donor): string {
    return `${donor.address.street}, ${donor.address.postalCode} ${donor.address.city}`;
  }

  edit(): void {
    this.fields = fieldsOf(this.donor());
    this.error.set('');
    this.saved.set(false);
    this.editing.set(true);
    afterNextRender(() => this.nameInput()?.nativeElement.focus(), { injector: this.injector });
  }

  cancel(): void {
    this.close();
  }

  save(form: NgForm): void {
    if (form.invalid || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.auth
      .updateProfile({
        name: this.fields.name.trim(),
        address: {
          street: this.fields.street.trim(),
          city: this.fields.city.trim(),
          postalCode: this.fields.postalCode.trim(),
        },
        preferredLocale: this.fields.preferredLocale,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.saved.set(true);
          this.close();
        },
        error: (failure: unknown) => {
          this.saving.set(false);
          if (problemTypeEndsWith(failure, UNAUTHENTICATED) || this.auth.status() === 'anonymous') {
            this.sessionEnded.emit();
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

  private close(): void {
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
