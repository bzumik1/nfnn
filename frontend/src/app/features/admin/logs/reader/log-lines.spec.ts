import { entriesOf, levelPattern, linesOf, logFormat } from './log-lines';

const SPRING = [
  '2026-11-10T19:09:47.639+01:00  INFO 1 --- [nova-nadeje] [scheduling-1] c.n.a.d.i.fio.FioBankStatementSource     : Fio answered 2026-11-07/2026-11-10: 2 movements',
  '2026-11-10T19:10:02.101+01:00 ERROR 1 --- [nova-nadeje] [scheduling-1] c.n.a.o.a.backup.BackupWatchService      : Backup watch failed for request 01a1b3c4',
  'java.io.UncheckedIOException: /backups/status.json: No such file or directory',
  '\tat backup.BackupStatusFile.read(BackupStatusFile.java:58)',
  '2026-11-10T19:16:07.196+01:00  WARN 1 --- [nova-nadeje] [http-nio-8080-exec-4] c.n.a.d.a.AuthorizationServerService     : The connector exchanged a token',
];

describe('Given the lines of a log window', () => {
  it('when the window is cut into lines, then each line carries the byte offset it starts at, counting UTF-8 bytes', () => {
    expect(linesOf({ from: 100, text: 'ač\nb\n' })).toEqual([
      { offset: 100, text: 'ač' },
      { offset: 104, text: 'b' },
    ]);
  });

  it('when the file is named, then its format follows its series', () => {
    expect(logFormat('backend.log')).toBe('spring');
    expect(logFormat('backend.log.2026-11-06.0.gz')).toBe('spring');
    expect(logFormat('mcp.log')).toBe('leveled');
    expect(logFormat('nginx-access.log.2026-11-06.gz')).toBe('access');
    expect(logFormat('backup.log')).toBe('plain');
    expect(logFormat('other.log')).toBe('plain');
  });
});

describe('Given the lines of backend.log', () => {
  const entries = entriesOf(linesOf({ from: 0, text: `${SPRING.join('\n')}\n` }), 'spring');

  it('when they are read, then each entry has its time, level, thread, class and message', () => {
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({
      offset: 0,
      at: '2026-11-10T19:09:47.639+01:00',
      level: 'INFO',
      thread: 'scheduling-1',
      logger: 'c.n.a.d.i.fio.FioBankStatementSource',
      title: 'FioBankStatementSource',
      message: 'Fio answered 2026-11-07/2026-11-10: 2 movements',
      details: [],
    });
  });

  it('when a line does not start with a time, then it belongs to the entry above it', () => {
    expect(entries[1]).toMatchObject({
      level: 'ERROR',
      title: 'BackupWatchService',
      message: 'Backup watch failed for request 01a1b3c4',
      details: [
        'java.io.UncheckedIOException: /backups/status.json: No such file or directory',
        '\tat backup.BackupStatusFile.read(BackupStatusFile.java:58)',
      ],
    });
    expect(entries[1].raw).toBe(SPRING.slice(1, 4).join('\n'));
  });

  it('when the window starts in the middle of an entry, then its first lines stand as an entry without a time', () => {
    const cut = entriesOf(
      linesOf({ from: 500, text: `${SPRING.slice(2).join('\n')}\n` }),
      'spring',
    );

    expect(cut[0]).toMatchObject({ offset: 500, at: null, level: null, message: SPRING[2] });
    expect(cut[0].details).toEqual([SPRING[3]]);
    expect(cut[1].level).toBe('WARN');
  });
});

describe('Given the lines of the other logs', () => {
  it('when mcp.log is read, then each line has its time, level and message', () => {
    const [entry] = entriesOf(
      linesOf({
        from: 0,
        text: '2026-11-10T20:46:01.513Z INFO MCP POST tools/list: 200 in 7 ms\n',
      }),
      'leveled',
    );

    expect(entry).toMatchObject({
      at: '2026-11-10T20:46:01.513Z',
      level: 'INFO',
      title: '',
      message: 'MCP POST tools/list: 200 in 7 ms',
    });
  });

  it('when nginx-access.log is read, then a request names its method and path and a 5xx is an error, a 4xx a warning', () => {
    const entries = entriesOf(
      linesOf({
        from: 0,
        text: [
          '2026-11-10T20:45:51+00:00 POST /mcp 200 16068 0.010 0.010',
          '2026-11-10T20:45:52+00:00 GET /api/live 404 0.002 0.002',
          '2026-11-10T20:45:53+00:00 GET /api/admin/operations/logs 502 157 0.000 -',
          '',
        ].join('\n'),
      }),
      'access',
    );

    expect(entries.map((entry) => [entry.level, entry.title, entry.message])).toEqual([
      ['INFO', 'POST /mcp', '200 · 16068 B · 0.010 s'],
      ['WARN', 'GET /api/live', '404 · 0.002 s'],
      ['ERROR', 'GET /api/admin/operations/logs', '502 · 157 B · 0.000 s'],
    ]);
  });

  it('when backup.log is read, then a line has its time and message and the offset without a colon still reads as a time', () => {
    const [entry] = entriesOf(
      linesOf({
        from: 0,
        text: '2026-11-10T03:00:22+0100 backup written: nfnn-2026-11-10_0300.dump.age\n',
      }),
      'plain',
    );

    expect(entry).toMatchObject({
      at: '2026-11-10T03:00:22+01:00',
      level: null,
      message: 'backup written: nfnn-2026-11-10_0300.dump.age',
    });
  });
});

describe('Given a level filter', () => {
  it('when the log writes levels, then warnings take warnings and errors and errors only errors', () => {
    expect(levelPattern('spring', 'warnings')).toBe('^\\S+\\s+(?:WARN|ERROR)\\b');
    expect(levelPattern('leveled', 'errors')).toBe('^\\S+\\s+ERROR\\b');
    expect(levelPattern('access', 'warnings')).toBe('^\\S+ \\S+ \\S+ [45]\\d\\d ');
    expect(levelPattern('access', 'errors')).toBe('^\\S+ \\S+ \\S+ 5\\d\\d ');
  });

  it('when the log writes no level, then there is nothing to filter by', () => {
    expect(levelPattern('plain', 'errors')).toBeNull();
  });
});
