import { TestBed } from '@angular/core/testing';

import { AppInstall, OFFER_HIDDEN_DAYS, OFFER_HIDDEN_KEY } from './app-install';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const MAC_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15';
const MAC_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36';
const WINDOWS_FIREFOX =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0';
const START = Date.UTC(2026, 10, 5, 9, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;

interface Device {
  readonly userAgent: string;
  readonly maxTouchPoints?: number;
  readonly standalone?: boolean;
}

function installOn(device: Device): AppInstall {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(device.userAgent);
  Object.defineProperty(navigator, 'maxTouchPoints', {
    configurable: true,
    get: () => device.maxTouchPoints ?? 0,
  });
  window.matchMedia = ((query: string) => ({
    matches: query === '(display-mode: standalone)' && device.standalone === true,
    media: query,
  })) as typeof window.matchMedia;
  const install = TestBed.inject(AppInstall);
  install.start();
  return install;
}

function installPrompt(
  outcome: 'accepted' | 'dismissed',
): Event & { prompt: ReturnType<typeof vi.fn> } {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  return Object.assign(event, {
    prompt: vi.fn(() => Promise.resolve()),
    userChoice: Promise.resolve({ outcome }),
  });
}

describe('Given the offer to install the web as an app', () => {
  const realMatchMedia = window.matchMedia;

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(START);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    window.matchMedia = realMatchMedia;
    delete (navigator as { maxTouchPoints?: number }).maxTouchPoints;
  });

  it('when an iPhone opens the web in its browser, then it is told to add it to the home screen through Share', () => {
    const install = installOn({ userAgent: IPHONE, maxTouchPoints: 5 });

    expect(install.way()).toBe('ios-share');
    expect(install.offered()).toBe(true);
  });

  it('when Safari on a Mac opens the web, then it is told to add it to the Dock', () => {
    expect(installOn({ userAgent: MAC_SAFARI }).way()).toBe('mac-dock');
  });

  it('when a browser offers no way to install, then nothing is offered', () => {
    expect(installOn({ userAgent: WINDOWS_FIREFOX }).offered()).toBe(false);
    TestBed.resetTestingModule();
    expect(installOn({ userAgent: MAC_CHROME }).way()).toBe('none');
  });

  it('when the web already runs as an installed app, then nothing is offered', () => {
    expect(installOn({ userAgent: IPHONE, maxTouchPoints: 5, standalone: true }).offered()).toBe(
      false,
    );
  });

  describe('when the browser offers its own install prompt', () => {
    it('then the offer installs through it and the browser shows no banner of its own', () => {
      const install = installOn({ userAgent: ANDROID_CHROME, maxTouchPoints: 5 });
      const prompt = installPrompt('accepted');

      window.dispatchEvent(prompt);

      expect(prompt.defaultPrevented).toBe(true);
      expect(install.way()).toBe('prompt');
    });

    it('and the donor accepts it, then the offer goes away', async () => {
      const install = installOn({ userAgent: ANDROID_CHROME, maxTouchPoints: 5 });
      const prompt = installPrompt('accepted');
      window.dispatchEvent(prompt);

      expect(await install.install()).toBe('accepted');

      expect(prompt.prompt).toHaveBeenCalledTimes(1);
      expect(install.offered()).toBe(false);
    });

    it('and the donor turns it down, then the prompt cannot be asked for again on this page', async () => {
      const install = installOn({ userAgent: MAC_CHROME });
      window.dispatchEvent(installPrompt('dismissed'));

      expect(await install.install()).toBe('dismissed');

      expect(install.way()).toBe('none');
      expect(await install.install()).toBe('unavailable');
    });

    it('and the app gets installed from the browser menu, then the offer goes away', () => {
      const install = installOn({ userAgent: ANDROID_CHROME, maxTouchPoints: 5 });
      window.dispatchEvent(installPrompt('accepted'));

      window.dispatchEvent(new Event('appinstalled'));

      expect(install.offered()).toBe(false);
    });
  });

  describe('when the donor says not now', () => {
    it('then the offer stays hidden for 90 days, also after the page loads again', () => {
      installOn({ userAgent: IPHONE, maxTouchPoints: 5 }).hideOffer();

      expect(localStorage.getItem(OFFER_HIDDEN_KEY)).toBe(
        String(START + OFFER_HIDDEN_DAYS * DAY_MS),
      );
      TestBed.resetTestingModule();
      vi.setSystemTime(START + OFFER_HIDDEN_DAYS * DAY_MS - 1);
      expect(installOn({ userAgent: IPHONE, maxTouchPoints: 5 }).offered()).toBe(false);
    });

    it('then after 90 days it is offered again', () => {
      localStorage.setItem(OFFER_HIDDEN_KEY, String(START + OFFER_HIDDEN_DAYS * DAY_MS));
      vi.setSystemTime(START + OFFER_HIDDEN_DAYS * DAY_MS);

      expect(installOn({ userAgent: IPHONE, maxTouchPoints: 5 }).offered()).toBe(true);
    });

    it('and the local storage is refused, then it is hidden for this page only', () => {
      const install = installOn({ userAgent: IPHONE, maxTouchPoints: 5 });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

      install.hideOffer();

      expect(install.offered()).toBe(false);
    });
  });
});
