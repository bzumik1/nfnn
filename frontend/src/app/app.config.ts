import { provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import {
  ApplicationConfig,
  EnvironmentProviders,
  ErrorHandler,
  inject,
  Provider,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {
  InMemoryScrollingFeature,
  InMemoryScrollingOptions,
  NavigationErrorHandlerFeature,
  provideRouter,
  withInMemoryScrolling,
  withNavigationErrorHandler,
} from '@angular/router';

import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth-interceptor';
import { AuthStore } from './core/auth/auth-store';
import { SESSION_DEVICE } from './core/auth/session-device';
import { ReportingErrorHandler } from './core/errors/reporting-error-handler';
import { ChunkLoadRecovery } from './core/reload/chunk-load-recovery';
import { CanonicalLink } from './core/seo/canonical-link';
import { AppInstall } from './core/install/app-install';
import { AppUpdates } from './core/updates/app-updates';
import { provideAppServiceWorker } from './core/updates/angular-service-worker';
import { serviceWorkerBypassInterceptor } from './core/updates/service-worker-bypass';
import { versionInterceptor } from './core/version/version-interceptor';
import { pagePinchLockAtStart } from './core/zoom/page-pinch-lock';
import { systemTextSizeAtStart } from './core/zoom/system-text-size';
import { DeviceCopies } from './device-copies';
import { DialogHistory } from './shared/ui/dialog/dialog-history';

const scrollOptions: InMemoryScrollingOptions = {
  scrollPositionRestoration: 'enabled',
  anchorScrolling: 'enabled',
};

const inMemoryScrolling: InMemoryScrollingFeature = withInMemoryScrolling(scrollOptions);

export const chunkLoadRecoveryFeature: NavigationErrorHandlerFeature = withNavigationErrorHandler(
  (error) => void inject(ChunkLoadRecovery).handleNavigationError(error),
);

export const appHttpClient: EnvironmentProviders = provideHttpClient(
  withXhr(),
  withInterceptors([authInterceptor, versionInterceptor, serviceWorkerBypassInterceptor]),
);

export const appErrorHandler: Provider = {
  provide: ErrorHandler,
  useClass: ReportingErrorHandler,
};

export const dialogHistoryAtStart: EnvironmentProviders = provideAppInitializer(
  () => void inject(DialogHistory),
);

export const deviceCopies: Provider = { provide: SESSION_DEVICE, useExisting: DeviceCopies };

export const appConfig: ApplicationConfig = {
  providers: [
    deviceCopies,
    provideBrowserGlobalErrorListeners(),
    appErrorHandler,
    provideRouter(routes, inMemoryScrolling, chunkLoadRecoveryFeature),
    appHttpClient,
    provideAppServiceWorker(),
    provideAppInitializer(() => {
      inject(AppUpdates).start();
      inject(AppInstall).start();
    }),
    provideAppInitializer(() => inject(AuthStore).restore()),
    provideAppInitializer(() => inject(CanonicalLink).start()),
    dialogHistoryAtStart,
    pagePinchLockAtStart,
    systemTextSizeAtStart,
  ],
};
