import { registerLocaleData } from '@angular/common';
import localeCs from '@angular/common/locales/cs';
import { LOCALE_ID, Provider } from '@angular/core';
import { SESSION_CHANNEL, TAB_LOCKS } from './app/core/auth/session-tabs';

registerLocaleData(localeCs);

const testProviders: Provider[] = [
  { provide: LOCALE_ID, useValue: 'cs' },
  { provide: TAB_LOCKS, useValue: null },
  { provide: SESSION_CHANNEL, useValue: () => null },
];

export default testProviders;
