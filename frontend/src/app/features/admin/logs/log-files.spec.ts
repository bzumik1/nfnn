import { logFile } from '../testing/admin-fixtures';
import { currentLogFiles, logSeries, logSeriesLabel, olderLogFileGroups } from './log-files';

const FILES = [
  logFile({ name: 'backend.log', changedAt: '2026-11-07T00:14:59Z' }),
  logFile({
    name: 'backend.log.2026-10-24.0.gz',
    changedAt: '2026-10-24T22:52:13Z',
    compressed: true,
  }),
  logFile({
    name: 'backend.log.2026-11-06.0.gz',
    changedAt: '2026-11-06T23:08:33Z',
    compressed: true,
  }),
  logFile({ name: 'backup.log', changedAt: '2026-11-06T23:37:52Z' }),
  logFile({ name: 'mcp.log', changedAt: '2026-11-07T00:15:13Z' }),
  logFile({ name: 'mcp.log.2026-11-05.gz', changedAt: '2026-11-06T00:00:15Z', compressed: true }),
  logFile({ name: 'nginx-access.log', changedAt: '2026-11-07T00:15:24Z' }),
  logFile({ name: 'odd.txt', changedAt: '2026-11-01T00:00:00Z' }),
];

describe('Given the log files of the server', () => {
  it('when a file is named, then its series is the name up to .log', () => {
    expect(logSeries('backend.log')).toBe('backend.log');
    expect(logSeries('backend.log.2026-10-24.0.gz')).toBe('backend.log');
    expect(logSeries('nginx-access.log.2026-11-05.gz')).toBe('nginx-access.log');
    expect(logSeries('odd.txt')).toBe('odd.txt');
  });

  it('when the current files are asked for, then each series is listed once, the application first', () => {
    expect(currentLogFiles(FILES).map((file) => file.name)).toEqual([
      'backend.log',
      'nginx-access.log',
      'backup.log',
      'mcp.log',
      'odd.txt',
    ]);
  });

  it('when the older files are asked for, then they are grouped by series in the same order, newest first', () => {
    const groups = olderLogFileGroups(FILES);

    expect(groups.map((group) => group.series)).toEqual(['backend.log', 'mcp.log']);
    expect(groups[0].files.map((file) => file.name)).toEqual([
      'backend.log.2026-11-06.0.gz',
      'backend.log.2026-10-24.0.gz',
    ]);
  });

  it('when a known series is described, then it says what writes into it', () => {
    expect(logSeriesLabel('backend.log')).toBe('Aplikace');
    expect(logSeriesLabel('nginx-access.log')).toBe('Požadavky na web');
    expect(logSeriesLabel('backup.log')).toBe('Zálohy');
    expect(logSeriesLabel('mcp.log')).toBe('Konektor');
    expect(logSeriesLabel('odd.txt')).toBeNull();
  });
});
