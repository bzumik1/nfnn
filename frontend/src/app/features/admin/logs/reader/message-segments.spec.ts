import { exceptionOf, frameOf, segmentsOf } from './message-segments';

function marked(message: string): string {
  return segmentsOf(message)
    .map((segment) =>
      segment.kind === 'code' ? `${segment.lead}[${segment.text}]${segment.trail}` : segment.text,
    )
    .join('');
}

describe('Given the message of a log entry', () => {
  it('when it names ids, ranges and constants, then those read as code and the prose stays text', () => {
    expect(
      marked(
        'The connector exchanged a token of donor 01a14df4-3471-7bc6-8b0e-ac47d1f547a3 for an API token',
      ),
    ).toBe(
      'The connector exchanged a token of donor [01a14df4-3471-7bc6-8b0e-ac47d1f547a3] for an API token',
    );
    expect(
      marked(
        'Fio answered 2026-11-07/2026-11-11: reported ids 27938449803-27939593106, 2 movements',
      ),
    ).toBe(
      'Fio answered [2026-11-07/2026-11-11]: reported ids [27938449803-27939593106], 2 movements',
    );
    expect(
      marked(
        'Fio import STARTUP failed with RATE_LIMITED; follow-up HOURLY at 2026-11-11T22:41:38.103779Z',
      ),
    ).toBe(
      'Fio import [STARTUP] failed with [RATE_LIMITED]; follow-up [HOURLY] at [2026-11-11T22:41:38.103779Z]',
    );
  });

  it('when it holds key=value pairs, a URL or a status, then each is code of its own', () => {
    expect(marked('Browser error kind=chunk-load place=navigation count=1')).toBe(
      'Browser error [kind=chunk-load] [place=navigation] [count=1]',
    );
    expect(
      marked(
        'request GET https://fioapi.fio.cz/v1/rest/periods/***/transactions.json was refused with HTTP 422: older',
      ),
    ).toBe(
      'request GET [https://fioapi.fio.cz/v1/rest/periods/***/transactions.json] was refused with [HTTP 422]: older',
    );
  });

  it('when code sits in brackets, then the brackets stay with the code so they never stand alone at a line end', () => {
    expect(marked('Health contributor (db/migrationDataSource) took 120604ms to respond')).toBe(
      'Health contributor ([db/migrationDataSource]) took [120604ms] to respond',
    );
    expect(
      segmentsOf('connection org.postgresql.jdbc.PgConnection@2d165547 (closed).').find(
        (segment) => segment.kind === 'code',
      ),
    ).toEqual({
      kind: 'code',
      text: 'org.postgresql.jdbc.PgConnection@2d165547',
      lead: '',
      trail: '',
    });
  });

  it('when it names a file, then the whole file name is one piece of code', () => {
    expect(marked('backup written: nfnn-2026-11-10_0300.dump.age')).toBe(
      'backup written: [nfnn-2026-11-10_0300.dump.age]',
    );
  });

  it('when it is plain prose, then it is one text segment', () => {
    expect(segmentsOf('Backup written')).toEqual([
      { kind: 'text', text: 'Backup written', lead: '', trail: '' },
    ]);
  });

  it('when the segments are joined again, then they give the message back unchanged', () => {
    const message =
      'HikariPool-1 - Failed to validate connection org.postgresql.jdbc.PgConnection@3570ade9 (This connection has been closed.). Possibly consider using a shorter maxLifetime value.';
    expect(
      segmentsOf(message)
        .map((segment) => `${segment.lead}${segment.text}${segment.trail}`)
        .join(''),
    ).toBe(message);
  });
});

describe('Given the lines under a log entry', () => {
  const details = [
    '',
    'org.springframework.jdbc.CannotGetJdbcConnectionException: Failed to obtain JDBC Connection',
    '\tat org.springframework.jdbc.datasource.DataSourceUtils.getConnection(DataSourceUtils.java:84) ~[spring-jdbc-7.0.10.jar!/:7.0.10]',
    '\tat org.springframework.jdbc.core.JdbcTemplate.execute(JdbcTemplate.java:362) ~[spring-jdbc-7.0.10.jar!/:7.0.10]',
  ];

  it('when they start with an exception, then its package, name, message and frames are told apart', () => {
    expect(exceptionOf(details)).toEqual({
      packageName: 'org.springframework.jdbc.',
      name: 'CannotGetJdbcConnectionException',
      message: 'Failed to obtain JDBC Connection',
      frames: [
        'at org.springframework.jdbc.datasource.DataSourceUtils.getConnection(DataSourceUtils.java:84) ~[spring-jdbc-7.0.10.jar!/:7.0.10]',
        'at org.springframework.jdbc.core.JdbcTemplate.execute(JdbcTemplate.java:362) ~[spring-jdbc-7.0.10.jar!/:7.0.10]',
      ],
    });
  });

  it('when they hold no exception, then there is none', () => {
    expect(exceptionOf(['second line of a message', 'third line'])).toBeNull();
    expect(exceptionOf([])).toBeNull();
  });
});

describe('Given a frame of a stack trace', () => {
  it('when it names a method, then its package, class and method, and place are told apart', () => {
    expect(
      frameOf(
        'at org.springframework.jdbc.core.JdbcTemplate.execute(JdbcTemplate.java:362) ~[spring-jdbc-7.0.10.jar!/:7.0.10]',
      ),
    ).toEqual({
      packageName: 'org.springframework.jdbc.core.',
      method: 'JdbcTemplate.execute',
      place: '(JdbcTemplate.java:362)',
      rest: '~[spring-jdbc-7.0.10.jar!/:7.0.10]',
    });
  });

  it('when it is no method frame, then it stays a plain line', () => {
    expect(frameOf('... 9 common frames omitted')).toBeNull();
  });
});
