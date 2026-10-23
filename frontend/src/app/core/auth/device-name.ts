const DEVICE_NAMES: [RegExp, string][] = [
  [/iPhone/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/Android/, 'Android'],
  [/Macintosh|Mac OS X/, 'Mac'],
  [/Windows/, 'Windows'],
  [/CrOS/, 'Chromebook'],
  [/Linux/, 'Linux'],
];

export function deviceName(document: Document): string {
  const agent = document.defaultView?.navigator.userAgent ?? '';
  return DEVICE_NAMES.find(([pattern]) => pattern.test(agent))?.[1] ?? '';
}
