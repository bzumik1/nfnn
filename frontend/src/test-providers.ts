import { registerLocaleData } from '@angular/common';
import localeCs from '@angular/common/locales/cs';
import { LOCALE_ID, Provider } from '@angular/core';

registerLocaleData(localeCs);

const testProviders: Provider[] = [{ provide: LOCALE_ID, useValue: 'cs' }];

export default testProviders;
