import { registerLocaleData } from '@angular/common';
import localeCs from '@angular/common/locales/cs';
import { LOCALE_ID, Provider } from '@angular/core';
import { SESSION_CHANNEL, TAB_LOCKS } from './app/core/auth/session-tabs';
import { LiveUpdates } from './app/core/live/live-updates';
import { FakeLiveUpdates } from './app/core/live/testing/live-fixtures';

registerLocaleData(localeCs);

const testProviders: Provider[] = [
  { provide: LOCALE_ID, useValue: 'cs' },
  { provide: TAB_LOCKS, useValue: null },
  { provide: SESSION_CHANNEL, useValue: () => null },
  { provide: LiveUpdates, useClass: FakeLiveUpdates },
];

export default testProviders;
