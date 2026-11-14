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
import { REMOVE_STYLES_ON_COMPONENT_DESTROY } from '@angular/platform-browser';
import {
  InMemoryScrollingFeature,
  InMemoryScrollingOptions,
  NavigationErrorHandlerFeature,
  provideRouter,
  RouteReuseStrategy,
  withInMemoryScrolling,
  withNavigationErrorHandler,
  withPreloading,
} from '@angular/router';

import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth-interceptor';
import { AuthStore } from './core/auth/auth-store';
import { SESSION_DEVICE } from './core/auth/session-device';
import { PublicSessionIdle } from './core/auth/public-session-idle';
import { ReportingErrorHandler } from './core/errors/reporting-error-handler';
import { ChunkLoadRecovery } from './core/reload/chunk-load-recovery';
import { BackTarget } from './core/navigation/back-target';
import { edgeSwipeBackAtStart } from './core/navigation/edge-swipe-back';
import { pageTransitionsAtStart } from './core/navigation/page-transitions';
import { keptPublicAnswersInterceptor } from './core/navigation/kept-public-answers';
import { KEPT_PAGES_OWNER } from './core/navigation/kept-tab-pages';
import { NavigationPreview } from './core/navigation/navigation-preview';
import { PreviewingReuse } from './core/navigation/previewing-reuse';
import { TabPagesPreloading } from './core/navigation/tab-preloading';
import { TabMemory } from './core/navigation/tab-memory';
import { CanonicalLink } from './core/seo/canonical-link';
import { Connectivity } from './core/connectivity/connectivity';
import { DeviceStatusRetry } from './core/device/status/device-status-retry';
import { UnseenPhotos } from './core/connectivity/unseen-photos';
import { connectivityInterceptor } from './core/connectivity/connectivity-interceptor';
import { administrationWritesInterceptor } from './core/admin-writes/administration-writes';
import { keptAnswerRefreshInterceptor } from './core/connectivity/kept-answer-refresh';
import { AppInstall } from './core/install/app-install';
import { AlertNotificationClicks } from './core/push/alert-notification-clicks';
import { AppBadge } from './core/push/app-badge';
import { OpenAlerts } from './core/push/open-alerts';
import { pressedOnTouchAtStart } from './core/touch/pressed-on-touch';
import { inputModalityAtStart } from './core/input/input-modality';
import { appearanceAtStart } from './core/appearance/appearance';
import { AppUpdates } from './core/updates/app-updates';
import { provideAppServiceWorker } from './core/updates/angular-service-worker';
import { runningWritesInterceptor } from './core/updates/running-writes';
import { serviceWorkerBypassInterceptor } from './core/updates/service-worker-bypass';
import { versionInterceptor } from './core/version/version-interceptor';
import { heldRecordRetryInterceptor } from './core/version/held-record-retry';
import { pagePinchLockAtStart } from './core/zoom/page-pinch-lock';
import { systemTextSizeAtStart } from './core/zoom/system-text-size';
import { windowControlsAtStart } from './core/layout/window-controls';
import { launchScreenAtStart } from './core/layout/launch-screen';
import { contentAheadAtStart } from './features/content/content-ahead';
import { DEVICE_COPY_DIAGNOSTICS } from './core/diagnostics/device-copy-diagnostics';
import { DeviceCopies } from './device-copies';
import { DialogHistory } from './shared/ui/dialog/dialog-history';

const scrollOptions: InMemoryScrollingOptions = {
  scrollPositionRestoration: 'enabled',
  anchorScrolling: 'enabled',
};

const inMemoryScrolling: InMemoryScrollingFeature = withInMemoryScrolling(scrollOptions);

export const tabPagesPreloading = withPreloading(TabPagesPreloading);

export const chunkLoadRecoveryFeature: NavigationErrorHandlerFeature = withNavigationErrorHandler(
  (error) => {
    if (!inject(NavigationPreview).drives()) {
      void inject(ChunkLoadRecovery).handleNavigationError(error);
    }
  },
);

export const keptTabPages: Provider[] = [
  { provide: RouteReuseStrategy, useExisting: PreviewingReuse },
  {
    provide: KEPT_PAGES_OWNER,
    useFactory: () => {
      const auth = inject(AuthStore);
      return () => auth.donor()?.id ?? null;
    },
  },
];

export const appHttpClient: EnvironmentProviders = provideHttpClient(
  withXhr(),
  withInterceptors([
    runningWritesInterceptor,
    keptPublicAnswersInterceptor,
    heldRecordRetryInterceptor,
    authInterceptor,
    versionInterceptor,
    keptAnswerRefreshInterceptor,
    serviceWorkerBypassInterceptor,
    connectivityInterceptor,
    administrationWritesInterceptor,
  ]),
);

export const keptPageStyles: Provider = {
  provide: REMOVE_STYLES_ON_COMPONENT_DESTROY,
  useValue: false,
};

export const appErrorHandler: Provider = {
  provide: ErrorHandler,
  useClass: ReportingErrorHandler,
};

export const dialogHistoryAtStart: EnvironmentProviders = provideAppInitializer(
  () => void inject(DialogHistory),
);

export const deviceCopies: Provider[] = [
  { provide: SESSION_DEVICE, useExisting: DeviceCopies },
  {
    provide: DEVICE_COPY_DIAGNOSTICS,
    useFactory: () => {
      const copies = inject(DeviceCopies);
      return () => copies.diagnostics();
    },
  },
];

export const connectivityAtStart: EnvironmentProviders = provideAppInitializer(() => {
  inject(Connectivity);
  inject(UnseenPhotos);
  inject(DeviceStatusRetry).start();
});

export const navigationAtStart: EnvironmentProviders = provideAppInitializer(() => {
  inject(BackTarget);
  inject(TabMemory);
});

export const appConfig: ApplicationConfig = {
  providers: [
    deviceCopies,
    provideBrowserGlobalErrorListeners(),
    appErrorHandler,
    provideRouter(routes, inMemoryScrolling, chunkLoadRecoveryFeature, tabPagesPreloading),
    keptTabPages,
    appHttpClient,
    provideAppServiceWorker(),
    provideAppInitializer(() => {
      inject(AppUpdates).start();
      inject(AppInstall).start();
    }),
    provideAppInitializer(() => {
      inject(AppBadge).start();
      inject(OpenAlerts).start();
      inject(AlertNotificationClicks).start();
    }),
    provideAppInitializer(() => inject(AuthStore).restore()),
    provideAppInitializer(() => inject(PublicSessionIdle).start()),
    provideAppInitializer(() => inject(CanonicalLink).start()),
    dialogHistoryAtStart,
    connectivityAtStart,
    pagePinchLockAtStart,
    pressedOnTouchAtStart,
    inputModalityAtStart,
    appearanceAtStart,
    systemTextSizeAtStart,
    windowControlsAtStart,
    navigationAtStart,
    launchScreenAtStart,
    contentAheadAtStart,
    edgeSwipeBackAtStart,
    pageTransitionsAtStart,
    keptPageStyles,
  ],
};
