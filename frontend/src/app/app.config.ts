import { provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import {
  ApplicationConfig,
  EnvironmentProviders,
  inject,
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
import { ChunkLoadRecovery } from './core/reload/chunk-load-recovery';
import { CanonicalLink } from './core/seo/canonical-link';

const scrollOptions: InMemoryScrollingOptions = {
  scrollPositionRestoration: 'enabled',
  anchorScrolling: 'enabled',
};

const inMemoryScrolling: InMemoryScrollingFeature = withInMemoryScrolling(scrollOptions);

export const chunkLoadRecoveryFeature: NavigationErrorHandlerFeature = withNavigationErrorHandler(
  (error) => inject(ChunkLoadRecovery).handleNavigationError(error),
);

export const appHttpClient: EnvironmentProviders = provideHttpClient(
  withXhr(),
  withInterceptors([authInterceptor]),
);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, inMemoryScrolling, chunkLoadRecoveryFeature),
    appHttpClient,
    provideAppInitializer(() => inject(AuthStore).restore()),
    provideAppInitializer(() => inject(CanonicalLink).start()),
  ],
};
