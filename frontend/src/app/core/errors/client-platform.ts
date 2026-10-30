import { Browser, DisplayMode, OperatingSystem } from './error-vocabulary';

export interface ClientPlatform {
  readonly browser: Browser;
  readonly browserMajor: number | null;
  readonly os: OperatingSystem;
  readonly display: DisplayMode;
}

export interface UserAgentSource {
  readonly userAgent: string;
  readonly maxTouchPoints: number;
}

const MAX_MAJOR = 999;

const BROWSER_PATTERNS: readonly (readonly [Browser, RegExp])[] = [
  ['samsung', /SamsungBrowser\/(\d+)/],
  ['edge', /Edg(?:e|A|iOS)?\/(\d+)/],
  ['opera', /(?:OPR|OPiOS)\/(\d+)/],
  ['firefox', /(?:Firefox|FxiOS)\/(\d+)/],
  ['chrome', /(?:CriOS|Chrome)\/(\d+)/],
  ['safari', /Version\/(\d+)[\d.]* (?:Mobile\/\S+ )?Safari\//],
  ['safari', /\((?:iPhone|iPad|iPod);.*AppleWebKit\/[\d.]+ \(KHTML, like Gecko\)(?: Mobile\/\S+)?$/],
];

export function detectPlatform(agent: UserAgentSource, standalone: boolean): ClientPlatform {
  const [browser, browserMajor] = browserOf(agent.userAgent);
  return {
    browser,
    browserMajor,
    os: systemOf(agent),
    display: standalone ? 'standalone' : 'browser',
  };
}

function browserOf(userAgent: string): readonly [Browser, number | null] {
  for (const [browser, pattern] of BROWSER_PATTERNS) {
    const found = pattern.exec(userAgent);
    if (found !== null) {
      return [browser, majorOf(found[1])];
    }
  }
  return ['other', null];
}

function majorOf(digits: string | undefined): number | null {
  const major = digits === undefined ? NaN : Number(digits);
  return Number.isInteger(major) && major >= 1 && major <= MAX_MAJOR ? major : null;
}

function systemOf({ userAgent, maxTouchPoints }: UserAgentSource): OperatingSystem {
  if (/Android/.test(userAgent)) {
    return 'android';
  }
  if (/iPhone|iPod/.test(userAgent)) {
    return 'ios';
  }
  if (/iPad/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)) {
    return 'ipados';
  }
  if (/Macintosh|Mac OS X/.test(userAgent)) {
    return 'macos';
  }
  if (/Windows/.test(userAgent)) {
    return 'windows';
  }
  if (/Linux|X11/.test(userAgent)) {
    return 'linux';
  }
  return 'other';
}
