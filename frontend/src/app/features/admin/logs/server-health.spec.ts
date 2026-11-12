import { diagnostics } from '../testing/admin-fixtures';
import { serverHealth } from './server-health';

const GIGABYTE = 1_000_000_000;
const MOUNTED = [
  { path: '/logs', mounted: true, freeBytes: 500 * GIGABYTE, totalBytes: 1000 * GIGABYTE },
  { path: '/backups', mounted: true, freeBytes: 500 * GIGABYTE, totalBytes: 1000 * GIGABYTE },
];

describe('Given the diagnostics of the server', () => {
  it('when the database answers, the folders are mounted and nothing runs short, then nothing is wrong', () => {
    expect(serverHealth(diagnostics({ disks: MOUNTED }))).toEqual({ kind: 'ok', findings: [] });
  });

  it('when the database does not answer or a folder is not mounted, then it is a failure naming each', () => {
    const health = serverHealth(
      diagnostics({
        database: { ...diagnostics().database, reachable: false },
        disks: [
          { path: '/logs', mounted: true, freeBytes: 500 * GIGABYTE, totalBytes: 1000 * GIGABYTE },
          { path: '/backups', mounted: false, freeBytes: 0, totalBytes: 0 },
        ],
      }),
    );

    expect(health).toEqual({
      kind: 'failure',
      findings: ['Databáze neodpovídá.', 'Složka /backups není připojená.'],
    });
  });

  it('when the memory is nearly full, threads wait for the database or a folder runs short of space, then it needs attention', () => {
    const base = diagnostics();
    const health = serverHealth(
      diagnostics({
        jvm: { ...base.jvm, heapUsedBytes: 92, heapMaxBytes: 100 },
        database: { ...base.database, waitingThreads: 3 },
        disks: [
          { path: '/logs', mounted: true, freeBytes: 50 * GIGABYTE, totalBytes: 1000 * GIGABYTE },
        ],
      }),
    );

    expect(health).toEqual({
      kind: 'attention',
      findings: [
        'Paměť je skoro plná (92 %).',
        'Na spojení s databází čekají vlákna (3).',
        'Ve složce /logs zbývá málo místa (5 %).',
      ],
    });
  });

  it('when the memory is just under the limit and a folder has a tenth free, then nothing is wrong', () => {
    const base = diagnostics();
    const health = serverHealth(
      diagnostics({
        jvm: { ...base.jvm, heapUsedBytes: 89, heapMaxBytes: 100 },
        disks: [
          { path: '/logs', mounted: true, freeBytes: 100 * GIGABYTE, totalBytes: 1000 * GIGABYTE },
        ],
      }),
    );

    expect(health.kind).toBe('ok');
  });
});
