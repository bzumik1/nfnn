package cz.novanadeje.app.support;

import cz.novanadeje.app.donations.application.importing.BankImportProperties;
import cz.novanadeje.app.donations.application.importing.BankImportRequests;
import cz.novanadeje.app.donations.application.importing.HistoryImportRun;
import cz.novanadeje.app.donations.application.importing.ImportBankPaymentsService;

import java.time.Clock;
import java.time.Instant;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

public class SynchronousBankImportRequests implements BankImportRequests {

    private final ImportBankPaymentsService imports;
    private final BankImportProperties properties;
    private final Clock clock;
    private final AtomicReference<HistoryImportRun> queuedHistory = new AtomicReference<>();
    private final AtomicBoolean enabled = new AtomicBoolean(true);

    public SynchronousBankImportRequests(ImportBankPaymentsService imports, BankImportProperties properties, Clock clock) {
        this.imports = imports;
        this.properties = properties;
        this.clock = clock;
    }

    @Override
    public void requestImport() {
        imports.importOnDemand(properties.toSettings(), properties.onDemandCooldown());
    }

    @Override
    public boolean inProgress() {
        return false;
    }

    @Override
    public boolean enabled() {
        return enabled.get();
    }

    public void turnOff() {
        enabled.set(false);
    }

    @Override
    public void requestHistoryImport(HistoryImportRun run) {
        if (run.startsAt().isAfter(clock.instant())) {
            queuedHistory.set(run);
            return;
        }
        queuedHistory.set(null);
        imports.importHistory(run, properties.toSettings());
    }

    public Optional<Instant> queuedHistoryImportAt() {
        return Optional.ofNullable(queuedHistory.get()).map(HistoryImportRun::startsAt);
    }

    public void runQueuedHistoryImport() {
        HistoryImportRun queued = queuedHistory.getAndSet(null);
        if (queued == null) {
            throw new IllegalStateException("No history import is queued");
        }
        imports.importHistory(queued, properties.toSettings());
    }

    public void reset() {
        queuedHistory.set(null);
        enabled.set(true);
    }
}
