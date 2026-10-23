package cz.novanadeje.app.operations.application.backup;

import cz.novanadeje.app.operations.application.event.BackupProblemsDetected;
import cz.novanadeje.app.operations.application.event.BackupRecovered;
import cz.novanadeje.app.operations.domain.backup.BackupAlertState;
import cz.novanadeje.app.operations.domain.backup.BackupAlertStateRepository;
import cz.novanadeje.app.operations.domain.backup.BackupProblem;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.Set;

@Service
public class BackupWatchService {

    private static final Logger log = LoggerFactory.getLogger(BackupWatchService.class);

    private final BackupAdministrationService backups;
    private final BackupAlertStateRepository states;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public BackupWatchService(BackupAdministrationService backups, BackupAlertStateRepository states, ApplicationEventPublisher events, Clock clock) {
        this.backups = backups;
        this.states = states;
        this.events = events;
        this.clock = clock;
    }

    @Transactional
    public Set<BackupProblem> check() {
        BackupAdministrationView view = backups.view();
        Set<BackupProblem> problems = view.health().problems();
        BackupAlertState state = states.current();
        Instant now = clock.instant();
        if (problems.isEmpty()) {
            if (state.reporting()) {
                states.save(BackupAlertState.nothingReported());
                events.publishEvent(new BackupRecovered(state.reportedProblems(), view, now));
                log.info("Backups are healthy again after {}", state.reportedProblems());
            }
            return problems;
        }
        if (problems.equals(state.reportedProblems())) {
            log.warn("Backup problems continue: {}", problems);
            return problems;
        }
        states.save(BackupAlertState.reported(problems, now));
        events.publishEvent(new BackupProblemsDetected(problems, view, now));
        log.warn("Backup problems detected: {}", problems);
        return problems;
    }
}
