/// <reference types="@angular/localize" />

export const PERSON_NAME_MESSAGES = {
  required: $localize`:@@donor.register.name.required:Vyplňte prosím jméno a příjmení, uvedeme je na potvrzení o daru.`,
};

export const COMPANY_NAME_MESSAGES = {
  required: $localize`:@@donor.register.companyName.required:Vyplňte prosím název firmy.`,
};

export const STREET_MESSAGES = {
  required: $localize`:@@donor.register.street.required:Vyplňte prosím ulici a číslo domu.`,
};

export const CITY_MESSAGES = {
  required: $localize`:@@donor.register.city.required:Vyplňte prosím město.`,
};

export const POSTAL_CODE_MESSAGES = {
  required: $localize`:@@donor.register.postalCode.required:Vyplňte prosím PSČ.`,
  pattern: $localize`:@@donor.register.postalCode.invalid:PSČ má pět číslic, například 400 01.`,
};
