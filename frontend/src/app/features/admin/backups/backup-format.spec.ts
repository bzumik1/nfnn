import { formatSize } from './backup-format';

describe('Given a size in bytes', () => {
  it('when it is under a megabyte, then it is rounded up to whole kilobytes', () => {
    expect(formatSize(1590)).toBe('2 kB');
    expect(formatSize(0)).toBe('0 kB');
    expect(formatSize(1024 * 1023)).toBe('1 023 kB');
  });

  it('when it is a megabyte or more, then it has one decimal in Czech', () => {
    expect(formatSize(1024 * 1024)).toBe('1,0 MB');
    expect(formatSize(12 * 1024 * 1024 + 500 * 1024)).toBe('12,5 MB');
  });
});
