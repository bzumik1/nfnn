const NO_BREAK_SPACE = ' ';
const KILOBYTE = 1024;
const MEGABYTE = KILOBYTE * KILOBYTE;
const GIGABYTE = MEGABYTE * KILOBYTE;
const MEGABYTES = new Intl.NumberFormat('cs-CZ', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const KILOBYTES = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 });

export function formatSize(bytes: number): string {
  if (bytes >= GIGABYTE) {
    return `${MEGABYTES.format(bytes / GIGABYTE)}${NO_BREAK_SPACE}GB`;
  }
  if (bytes >= MEGABYTE) {
    return `${MEGABYTES.format(bytes / MEGABYTE)}${NO_BREAK_SPACE}MB`;
  }
  return `${KILOBYTES.format(Math.ceil(bytes / KILOBYTE))}${NO_BREAK_SPACE}kB`;
}
