import { detectPlatform } from '../errors/client-platform';
import { ServiceWorkerPush } from './service-worker-push';

export type PushAvailability =
  'available' | 'home-screen' | 'no-push' | 'denied' | 'no-service-worker';

export function pushAvailability(view: Window | null, push: ServiceWorkerPush): PushAvailability {
  if (view === null) {
    return 'no-push';
  }
  const navigator = view.navigator;
  const platform = detectPlatform(
    { userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints ?? 0 },
    false,
  );
  const hasPush = 'PushManager' in view && 'Notification' in view;
  if ((platform.os === 'ios' || platform.os === 'ipados') && !runsFromHomeScreen(view)) {
    return 'home-screen';
  }
  if (!hasPush) {
    return 'no-push';
  }
  if (!push.isEnabled) {
    return 'no-service-worker';
  }
  return permissionOf(view) === 'denied' ? 'denied' : 'available';
}

function permissionOf(view: Window): string {
  try {
    return (view as Window & { Notification: { permission: string } }).Notification.permission;
  } catch {
    return 'default';
  }
}

function runsFromHomeScreen(view: Window): boolean {
  const homeScreen = (view.navigator as Navigator & { readonly standalone?: boolean }).standalone;
  return (
    homeScreen === true ||
    (typeof view.matchMedia === 'function' && view.matchMedia('(display-mode: standalone)').matches)
  );
}
