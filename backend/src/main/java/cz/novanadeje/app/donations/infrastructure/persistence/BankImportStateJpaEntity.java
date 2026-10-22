package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.importing.BankImportState;
import cz.novanadeje.app.donations.domain.importing.ImportCoverage;
import cz.novanadeje.app.donations.domain.importing.ImportFailureKind;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;

@Entity
@Table(name = "bank_import_state")
public class BankImportStateJpaEntity {

    static final short SINGLETON_ID = 1;

    @Id
    private Short id;

    @Column(name = "covered_from")
    private LocalDate coveredFrom;

    @Column(name = "covered_to")
    private LocalDate coveredTo;

    @Column(name = "last_attempted_at")
    private Instant lastAttemptedAt;

    @Column(name = "last_succeeded_at")
    private Instant lastSucceededAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "last_failure_kind", length = 32)
    private ImportFailureKind lastFailureKind;

    @Column(name = "last_failure_message", length = BankImportState.MAX_FAILURE_MESSAGE_LENGTH)
    private String lastFailureMessage;

    @Column(name = "consecutive_failures", nullable = false)
    private int consecutiveFailures;

    @Enumerated(EnumType.STRING)
    @Column(name = "reported_outage", length = 32)
    private ImportFailureKind reportedOutage;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected BankImportStateJpaEntity() {
    }

    static BankImportStateJpaEntity fromDomain(BankImportState state) {
        BankImportStateJpaEntity entity = new BankImportStateJpaEntity();
        entity.id = SINGLETON_ID;
        entity.coveredFrom = state.coverage().coveredFrom();
        entity.coveredTo = state.coverage().coveredTo();
        entity.lastAttemptedAt = state.lastAttemptedAt().orElse(null);
        entity.lastSucceededAt = state.lastSucceededAt().orElse(null);
        entity.lastFailureKind = state.lastFailureKind().orElse(null);
        entity.lastFailureMessage = state.lastFailureMessage().orElse(null);
        entity.consecutiveFailures = state.consecutiveFailures();
        entity.reportedOutage = state.reportedOutage().orElse(null);
        entity.updatedAt = state.updatedAt();
        return entity;
    }

    BankImportState toDomain() {
        return BankImportState.reconstitute(
                new ImportCoverage(coveredFrom, coveredTo),
                Optional.ofNullable(lastAttemptedAt),
                Optional.ofNullable(lastSucceededAt),
                Optional.ofNullable(lastFailureKind),
                Optional.ofNullable(lastFailureMessage),
                consecutiveFailures,
                Optional.ofNullable(reportedOutage),
                updatedAt);
    }
}
