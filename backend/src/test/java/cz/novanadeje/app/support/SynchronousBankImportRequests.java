package cz.novanadeje.app.support;

import cz.novanadeje.app.donations.application.importing.BankImportProperties;
import cz.novanadeje.app.donations.application.importing.BankImportRequests;
import cz.novanadeje.app.donations.application.importing.ImportBankPaymentsService;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

public class SynchronousBankImportRequests implements BankImportRequests {

    private final ImportBankPaymentsService imports;
    private final BankImportProperties properties;
    private final Clock clock;
    private final AtomicReference<QueuedHistoryImport> queuedHistory = new AtomicReference<>();

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
        return true;
    }

    @Override
    public void requestHistoryImport(LocalDate from, Instant at) {
        if (at.isAfter(clock.instant())) {
            queuedHistory.set(new QueuedHistoryImport(from, at));
            return;
        }
        queuedHistory.set(null);
        imports.importHistory(from, properties.toSettings());
    }

    public Optional<Instant> queuedHistoryImportAt() {
        return Optional.ofNullable(queuedHistory.get()).map(QueuedHistoryImport::at);
    }

    public void runQueuedHistoryImport() {
        QueuedHistoryImport queued = queuedHistory.getAndSet(null);
        if (queued == null) {
            throw new IllegalStateException("No history import is queued");
        }
        imports.importHistory(queued.from(), properties.toSettings());
    }

    public void forgetQueuedHistoryImport() {
        queuedHistory.set(null);
    }

    private record QueuedHistoryImport(LocalDate from, Instant at) {
    }
}
