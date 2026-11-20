package cz.novanadeje.app.operations.application.backup;

import cz.novanadeje.app.operations.application.alerts.OperationalAlertService;
import cz.novanadeje.app.operations.domain.alerts.MonitoredArea;
import cz.novanadeje.app.operations.domain.backup.BackupAlert;
import cz.novanadeje.app.operations.domain.backup.BackupAlertRepository;
import cz.novanadeje.app.operations.domain.backup.BackupAlertState;
import cz.novanadeje.app.operations.domain.backup.BackupAlertStateRepository;
import cz.novanadeje.app.operations.domain.backup.BackupProblem;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionOperations;

import java.time.Clock;
import java.time.Instant;
import java.util.Set;

@Service
public class BackupWatchService {

    private static final Logger log = LoggerFactory.getLogger(BackupWatchService.class);

    private final BackupAdministrationService backups;
    private final BackupAlertStateRepository states;
    private final BackupAlertRepository backupAlerts;
    private final OperationalAlertService operationalAlerts;
    private final BackupAlertDelivery delivery;
    private final TransactionOperations transactions;
    private final Clock clock;

    public BackupWatchService(BackupAdministrationService backups, BackupAlertStateRepository states, BackupAlertRepository backupAlerts,
                              OperationalAlertService operationalAlerts, BackupAlertDelivery delivery, TransactionOperations transactions, Clock clock) {
        this.backups = backups;
        this.states = states;
        this.backupAlerts = backupAlerts;
        this.operationalAlerts = operationalAlerts;
        this.delivery = delivery;
        this.transactions = transactions;
        this.clock = clock;
    }

    public Set<BackupProblem> check() {
        BackupAdministrationView view = backups.view();
        Set<BackupProblem> problems = view.health().problems();
        transactions.executeWithoutResult(status -> record(problems));
        deliverAlerts(new LastBackupRuns(view.lastBackup(), view.lastTestRestore()));
        return problems;
    }

    private void queue(BackupAlert alert, Instant now) {
        backupAlerts.dropWaiting(now);
        backupAlerts.add(alert, now);
    }

    private void deliverAlerts(LastBackupRuns lastRuns) {
        try {
            delivery.deliverWaiting(lastRuns);
        } catch (RuntimeException failure) {
            log.error("Delivering the backup alerts failed: {}; retrying after the next backup check", failure.getClass().getSimpleName());
        }
    }

    private void record(Set<BackupProblem> problems) {
        BackupAlertState state = states.current();
        Instant now = clock.instant();
        if (problems.isEmpty()) {
            if (state.reporting()) {
                states.save(BackupAlertState.nothingReported());
                queue(new BackupAlert.Recovered(state.reportedProblems(), now), now);
                log.info("Backups are healthy again after {}", state.reportedProblems());
            }
            operationalAlerts.record(MonitoredArea.BACKUPS, false, now);
            return;
        }
        if (problems.equals(state.reportedProblems())) {
            operationalAlerts.record(MonitoredArea.BACKUPS, true, now);
            log.warn("Backup problems continue: {}", problems);
            return;
        }
        states.save(BackupAlertState.reported(problems, now));
        queue(new BackupAlert.ProblemsDetected(problems, now), now);
        operationalAlerts.record(MonitoredArea.BACKUPS, true, now);
        log.warn("Backup problems detected: {}", problems);
    }
}
