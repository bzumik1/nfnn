package cz.novanadeje.app.donations.application.importing;

import cz.novanadeje.app.donations.domain.importing.BankCalendar;
import cz.novanadeje.app.donations.domain.importing.BankImportOff;
import cz.novanadeje.app.donations.domain.importing.BankImportState;
import cz.novanadeje.app.donations.domain.importing.BankImportStateRepository;
import cz.novanadeje.app.donations.domain.importing.HistoryImportStart;
import cz.novanadeje.app.donations.domain.importing.ImportFailureKind;
import cz.novanadeje.app.donations.domain.importing.ImportPlan;
import cz.novanadeje.app.donations.domain.importing.ImportPlanner;
import cz.novanadeje.app.donations.domain.importing.ImportTrigger;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

@Service
public class HistoryImportService {

    static final String ACTION = "REQUEST_HISTORY_IMPORT";

    private final BankImportRequests imports;
    private final BankImportStateRepository states;
    private final BankImportProperties properties;
    private final HistoryImportTracker tracker;
    private final ApplicationEventPublisher events;
    private final TransactionTemplate transaction;
    private final Clock clock;
    private final Object requests = new Object();

    public HistoryImportService(BankImportRequests imports, BankImportStateRepository states, BankImportProperties properties,
                                HistoryImportTracker tracker, ApplicationEventPublisher events, TransactionTemplate transaction, Clock clock) {
        this.imports = imports;
        this.states = states;
        this.properties = properties;
        this.tracker = tracker;
        this.events = events;
        this.transaction = transaction;
        this.clock = clock;
    }

    public HistoryImportRun request(UUID adminId, LocalDate from) {
        if (!imports.enabled()) {
            throw new BankImportOff();
        }
        LocalDate today = BankCalendar.today(clock);
        HistoryImportStart start = HistoryImportStart.of(from, today);
        synchronized (requests) {
            LocalDate runFrom = tracker.last()
                    .filter(run -> run.status() == HistoryImportStatus.QUEUED)
                    .map(run -> run.requested().from())
                    .filter(queued -> queued.isBefore(start.from()))
                    .orElse(start.from());
            BankImportState state = states.current();
            ImportPlan plan = ImportPlanner.plan(state.coverage(), today, properties.toSettings().withHistoryFrom(runFrom), ImportTrigger.HISTORY);
            Instant now = clock.instant();
            Instant startsAt = state.lastAttemptedAt()
                    .map(attempted -> attempted.plus(properties.onDemandCooldown()))
                    .filter(now::isBefore)
                    .orElse(now);
            transaction.executeWithoutResult(status -> events.publishEvent(new AdminActionPerformed(adminId, ACTION, Optional.empty(),
                    "Vyžádáno načtení starších plateb z banky od " + start.from(), now)));
            HistoryImportRun run = tracker.queue(plan.period(), plan.needsUnlockedHistory(), now, startsAt);
            try {
                imports.requestHistoryImport(run);
            } catch (RuntimeException refused) {
                tracker.abandoned(run.id(), ImportFailureKind.UNEXPECTED, now);
                throw refused;
            }
            return tracker.last().orElse(run);
        }
    }
}
