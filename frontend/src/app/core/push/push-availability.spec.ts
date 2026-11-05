import { pushAvailability } from './push-availability';
import { NO_PUSH, ServiceWorkerPush } from './service-worker-push';

const CHROME_ON_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const SAFARI_ON_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';

interface ViewOptions {
  userAgent?: string;
  push?: boolean;
  permission?: string;
  standalone?: boolean;
}

function view({
  userAgent = CHROME_ON_ANDROID,
  push = true,
  permission = 'default',
  standalone = false,
}: ViewOptions = {}): Window {
  const surface = push ? { PushManager: class {}, Notification: { permission } } : {};
  return {
    ...surface,
    navigator: { userAgent, maxTouchPoints: 5, standalone },
    matchMedia: (query: string) => ({ matches: standalone && query.includes('standalone') }),
  } as unknown as Window;
}

const ENABLED: ServiceWorkerPush = { ...NO_PUSH, isEnabled: true };

describe('Given whether this device can receive alerts', () => {
  it('when the worker runs in a browser with the Push API, then alerts are available', () => {
    expect(pushAvailability(view(), ENABLED)).toBe('available');
  });

  it('when Safari on an iPhone runs the site in a tab, then it must first be added to the home screen', () => {
    expect(pushAvailability(view({ userAgent: SAFARI_ON_IPHONE, push: false }), ENABLED)).toBe(
      'home-screen',
    );
  });

  it('when the site runs from the home screen of an iPhone, then alerts are available', () => {
    expect(pushAvailability(view({ userAgent: SAFARI_ON_IPHONE, standalone: true }), ENABLED)).toBe(
      'available',
    );
  });

  it('when the browser has no Push API, then it says so', () => {
    expect(pushAvailability(view({ push: false }), ENABLED)).toBe('no-push');
  });

  it('when notifications are blocked for the site, then it says they are denied', () => {
    expect(pushAvailability(view({ permission: 'denied' }), ENABLED)).toBe('denied');
  });

  it('when no service worker controls the page, then it says so', () => {
    expect(pushAvailability(view(), NO_PUSH)).toBe('no-service-worker');
  });

  it('when there is no window, then alerts are not available', () => {
    expect(pushAvailability(null, ENABLED)).toBe('no-push');
  });
});
