/// <reference types="@angular/localize" />

import './app/core/security/install-trusted-types';
import './app/core/navigation/install-own-history';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { BootReport, markCodeArrived } from './app/core/updates/boot-report';

markCodeArrived(document);

bootstrapApplication(App, appConfig)
  .then((app) => app.injector.get(BootReport).started())
  .catch((err) => console.error(err));
