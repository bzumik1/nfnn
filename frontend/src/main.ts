/// <reference types="@angular/localize" />

import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { TrustedTypesFactory, installScriptUrlPolicy } from './app/core/security/trusted-types';

installScriptUrlPolicy(
  (globalThis as { trustedTypes?: TrustedTypesFactory }).trustedTypes,
  document.baseURI,
);

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
