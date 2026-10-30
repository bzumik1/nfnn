import { detectPlatform } from './client-platform';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const IPAD_AS_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1';
const IPHONE_HOME_SCREEN =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const ANDROID_SAMSUNG =
  'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36';
const WINDOWS_EDGE =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.2903.70';
const WINDOWS_OPERA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/115.0.0.0';
const LINUX_FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0';
const MAC_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

describe('Given the user agent and display of a browser', () => {
  it.each([
    ['Safari on an iPhone', IPHONE_SAFARI, 0, { browser: 'safari', browserMajor: 18, os: 'ios' }],
    ['Safari on an iPad that says Macintosh', IPAD_AS_MAC, 5, { browser: 'safari', browserMajor: 18, os: 'ipados' }],
    ['Safari on a Mac', IPAD_AS_MAC, 0, { browser: 'safari', browserMajor: 18, os: 'macos' }],
    ['Chrome on an iPhone', IPHONE_CHROME, 0, { browser: 'chrome', browserMajor: 131, os: 'ios' }],
    ['the Home Screen app on an iPhone', IPHONE_HOME_SCREEN, 0, { browser: 'safari', browserMajor: null, os: 'ios' }],
    ['Chrome on Android', ANDROID_CHROME, 5, { browser: 'chrome', browserMajor: 131, os: 'android' }],
    ['Samsung Internet', ANDROID_SAMSUNG, 5, { browser: 'samsung', browserMajor: 26, os: 'android' }],
    ['Edge on Windows', WINDOWS_EDGE, 0, { browser: 'edge', browserMajor: 131, os: 'windows' }],
    ['Opera on Windows', WINDOWS_OPERA, 0, { browser: 'opera', browserMajor: 115, os: 'windows' }],
    ['Firefox on Linux', LINUX_FIREFOX, 0, { browser: 'firefox', browserMajor: 140, os: 'linux' }],
    ['Chrome on a Mac', MAC_CHROME, 0, { browser: 'chrome', browserMajor: 131, os: 'macos' }],
    ['an unknown agent', 'Zxqv Kanárek 7781/2099', 0, { browser: 'other', browserMajor: null, os: 'other' }],
  ])('when it is %s, then only its family, major version and system are kept', (_what, userAgent, touchPoints, expected) => {
    expect(detectPlatform({ userAgent, maxTouchPoints: touchPoints }, false)).toEqual({
      ...expected,
      display: 'browser',
    });
  });

  it('when the major version is out of range, then it is left out', () => {
    expect(detectPlatform({ userAgent: 'Mozilla/5.0 Firefox/1000.0', maxTouchPoints: 0 }, false).browserMajor).toBeNull();
  });

  it('when the page runs as an installed app, then the display is standalone', () => {
    expect(detectPlatform({ userAgent: IPHONE_HOME_SCREEN, maxTouchPoints: 5 }, true).display).toBe(
      'standalone',
    );
  });
});
