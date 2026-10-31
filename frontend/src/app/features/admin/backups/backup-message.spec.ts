import { backupRun, backupsView } from '../testing/admin-fixtures';
import { needsTechnician, technicianMessage } from './backup-message';

describe('Given the state of the backups', () => {
  describe('when the backup folder is gone and the last backup failed', () => {
    const view = backupsView({
      available: false,
      backups: [],
      lastBackup: backupRun({
        outcome: 'FAILED',
        fileName: null,
        sizeBytes: null,
        error: 'pg_dump: error: connection to server failed',
      }),
      lastTestRestore: null,
      problems: ['BACKUPS_UNAVAILABLE', 'BACKUP_FAILED'],
      key: { available: true, confirmed: false, confirmedAt: null },
    });

    it('then a technician is needed', () => {
      expect(needsTechnician(view)).toBe(true);
    });

    it('then the message names what is wrong, the technical details and the runs, in plain text', () => {
      expect(technicianMessage(view)).toBe(
        [
          'Zálohy webu Nová naděje potřebují pomoc správce serveru.',
          '',
          'Co je špatně:',
          '- Web teď nevidí složku se zálohami, takže zálohy nejde vytvořit ani stáhnout. Data webu jsou v pořádku.',
          '- Poslední záloha se nepovedla. Data webu jsou v pořádku, ale nejsou zálohovaná.',
          '',
          'Technické podrobnosti:',
          '- Backend nevidí složku záloh. Zkontrolujte compose na serveru: backend má mít připojenou složku /DATA/AppData/nfnn/backups jako /backups.',
          '- Poslední záloha selhala.',
          '- Poslední záloha: nepovedla se 23. 10. 2026 03:00: pg_dump: error: connection to server failed',
          '- Poslední zkušební obnova: zatím žádná',
        ].join('\n'),
      );
    });

    it('then the message does not ask the technician to copy and send it', () => {
      expect(technicianMessage(view)).not.toContain('pošlete');
    });

    it('then nothing about the backup key goes into the message', () => {
      expect(technicianMessage(view).toLowerCase()).not.toContain('klíč');
    });
  });

  describe('when only the test restore has not run yet', () => {
    const view = backupsView({ problems: ['TEST_RESTORE_MISSING'] });

    it('then the administrator fixes it alone and no technician is needed', () => {
      expect(needsTechnician(view)).toBe(false);
    });
  });

  describe('when the runs succeeded but the daily backup stopped', () => {
    const view = backupsView({ problems: ['BACKUP_STALE'] });

    it('then the message lists the last successful runs', () => {
      expect(technicianMessage(view).split('\n').slice(-2)).toEqual([
        '- Poslední záloha: 23. 10. 2026 03:00, nfnn-2026-10-23_0300.dump.age (2\u00a0kB)',
        '- Poslední zkušební obnova: 18. 10. 2026 04:00, 37 tabulek, nfnn-2026-10-18_0300.dump.age',
      ]);
    });
  });
});
