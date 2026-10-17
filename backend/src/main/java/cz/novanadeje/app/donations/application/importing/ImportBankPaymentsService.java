package cz.novanadeje.app.donations.application.importing;

import cz.novanadeje.app.donations.domain.importing.BankCalendar;
import cz.novanadeje.app.donations.domain.importing.BankImportState;
import cz.novanadeje.app.donations.domain.importing.BankImportStateRepository;
import cz.novanadeje.app.donations.domain.importing.ImportCoverage;
import cz.novanadeje.app.donations.domain.importing.ImportFailureKind;
import cz.novanadeje.app.donations.domain.importing.ImportPlan;
import cz.novanadeje.app.donations.domain.importing.ImportPlanner;
import cz.novanadeje.app.donations.domain.importing.ImportSettings;
import cz.novanadeje.app.donations.domain.importing.ImportTrigger;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

@Service
public class ImportBankPaymentsService {

    private static final Logger log = LoggerFactory.getLogger(ImportBankPaymentsService.class);
    private static final Duration FOLLOW_UP_MARGIN = Duration.ofSeconds(1);

    private final BankStatementSource source;
    private final BankStatementRecorder recorder;
    private final BankImportStateRepository states;
    private final Clock clock;

    public ImportBankPaymentsService(BankStatementSource source, BankStatementRecorder recorder, BankImportStateRepository states, Clock clock) {
        this.source = source;
        this.recorder = recorder;
        this.states = states;
        this.clock = clock;
    }

    public ImportReport importIncomingPayments(ImportTrigger trigger, ImportSettings settings) {
        BankImportState state = states.current();
        ImportPlan plan = ImportPlanner.plan(state.coverage(), BankCalendar.today(clock), settings, trigger);
        try {
            BankStatement statement = source.fetch(plan.period());
            ImportCounts counts = recorder.record(statement, plan, clock.instant());
            return completed(trigger, plan, statement, counts);
        } catch (BankStatementUnavailable unavailable) {
            recorder.recordFailure(unavailable.kind(), unavailable.getMessage(), clock.instant());
            return failed(trigger, plan, state.coverage(), unavailable);
        } catch (RuntimeException unexpected) {
            recordUnexpected(unexpected);
            throw unexpected;
        }
    }

    private ImportReport completed(ImportTrigger trigger, ImportPlan plan, BankStatement statement, ImportCounts counts) {
        ImportCoverage coverage = states.current().coverage();
        log.info("Fio import {} {} completed: bank reported {}, {} movements, {} new incoming, {} known, {} paired by symbol, "
                        + "{} by account, {} accounts learned, {} left unpaired, covered {}",
                trigger, plan.period(), statement.reported().map(Object::toString).orElse("no period"), counts.movementsReceived(),
                counts.incomingNew(), counts.incomingKnown(), counts.pairedBySymbol(), counts.pairedByAccount(),
                counts.accountsLearned(), counts.leftUnpaired(), coverage);
        return new ImportReport(trigger, plan.period(), plan.needsUnlockedHistory(), statement.reported(), coverage, counts,
                Optional.empty(), Optional.empty());
    }

    private ImportReport failed(ImportTrigger trigger, ImportPlan plan, ImportCoverage coverage, BankStatementUnavailable unavailable) {
        return new ImportReport(trigger, plan.period(), plan.needsUnlockedHistory(), Optional.empty(), coverage, ImportCounts.none(),
                Optional.of(unavailable.kind()), followUp(trigger, plan, unavailable));
    }

    private Optional<FollowUp> followUp(ImportTrigger trigger, ImportPlan plan, BankStatementUnavailable unavailable) {
        return switch (unavailable.kind()) {
            case RATE_LIMITED -> unavailable.retryAfter().map(at -> new FollowUp(at.plus(FOLLOW_UP_MARGIN), trigger));
            case HISTORY_LOCKED -> historyLockedFollowUp(plan, unavailable);
            default -> Optional.empty();
        };
    }

    private Optional<FollowUp> historyLockedFollowUp(ImportPlan plan, BankStatementUnavailable unavailable) {
        if (!plan.needsUnlockedHistory()) {
            log.error("Fio refused {} as locked history although it lies inside the history window; "
                    + "the history-window is too long for this account", plan.period());
            return Optional.empty();
        }
        return unavailable.retryAfter().map(at -> new FollowUp(at.plus(FOLLOW_UP_MARGIN), ImportTrigger.HOURLY));
    }

    private void recordUnexpected(RuntimeException unexpected) {
        String message = unexpected.getMessage() == null ? unexpected.getClass().getName() : unexpected.getMessage();
        Instant at = clock.instant();
        try {
            recorder.recordFailure(ImportFailureKind.UNEXPECTED, message, at);
        } catch (RuntimeException recordingFailure) {
            unexpected.addSuppressed(recordingFailure);
        }
    }
}
