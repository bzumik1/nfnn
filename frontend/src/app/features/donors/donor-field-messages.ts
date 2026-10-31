/// <reference types="@angular/localize" />

const PRINTABLE_ON_RECEIPT = $localize`:@@donor.register.printableOnReceipt:Obsahuje znak, který na potvrzení o daru nevytiskneme, například emoji nebo čínské písmo. Napište prosím tento údaj latinkou, cyrilicí nebo řeckým písmem.`;

export const PERSON_NAME_MESSAGES = {
  required: $localize`:@@donor.register.name.required:Vyplňte prosím jméno a příjmení, uvedeme je na potvrzení o daru.`,
  printableOnReceipt: PRINTABLE_ON_RECEIPT,
};

export const COMPANY_NAME_MESSAGES = {
  required: $localize`:@@donor.register.companyName.required:Vyplňte prosím název firmy.`,
  printableOnReceipt: PRINTABLE_ON_RECEIPT,
};

export const STREET_MESSAGES = {
  required: $localize`:@@donor.register.street.required:Vyplňte prosím ulici a číslo domu.`,
  printableOnReceipt: PRINTABLE_ON_RECEIPT,
};

export const CITY_MESSAGES = {
  required: $localize`:@@donor.register.city.required:Vyplňte prosím město.`,
  printableOnReceipt: PRINTABLE_ON_RECEIPT,
};

export const POSTAL_CODE_MESSAGES = {
  required: $localize`:@@donor.register.postalCode.required:Vyplňte prosím PSČ.`,
  pattern: $localize`:@@donor.register.postalCode.invalid:PSČ má pět číslic, například 400 01.`,
};
