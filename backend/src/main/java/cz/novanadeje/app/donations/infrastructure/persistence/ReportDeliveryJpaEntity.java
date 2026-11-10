package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.importing.ImportFailureKind;
import cz.novanadeje.app.donations.domain.report.BankImportStatus;
import cz.novanadeje.app.donations.domain.report.DonationTallies;
import cz.novanadeje.app.donations.domain.report.DonorCounts;
import cz.novanadeje.app.donations.domain.report.ImportFailure;
import cz.novanadeje.app.donations.domain.report.ReportContent;
import cz.novanadeje.app.donations.domain.report.ReportDelivery;
import cz.novanadeje.app.donations.domain.report.ReportMonth;
import cz.novanadeje.app.donations.domain.report.Tally;
import cz.novanadeje.app.shared.domain.Money;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.Optional;
import java.util.UUID;

@Entity
@Table(name = "donation_report_delivery")
class ReportDeliveryJpaEntity {

    @Id
    private UUID id;

    @Column(name = "report_month", nullable = false)
    private LocalDate reportMonth;

    @Column(name = "sent_at", nullable = false)
    private Instant sentAt;

    @Column(name = "by_hand", nullable = false)
    private boolean byHand;

    @Column(name = "recipient_count", nullable = false)
    private short recipientCount;

    @Column(name = "includes_donors", nullable = false)
    private boolean includesDonors;

    @Column(name = "registered_donors")
    private Long registeredDonors;

    @Column(name = "new_donors")
    private Long newDonors;

    @Column(name = "includes_donations", nullable = false)
    private boolean includesDonations;

    @Column(name = "received_count")
    private Integer receivedCount;

    @Column(name = "received_total_minor")
    private Long receivedTotalMinor;

    @Column(name = "paired_count")
    private Integer pairedCount;

    @Column(name = "paired_total_minor")
    private Long pairedTotalMinor;

    @Column(name = "received_in_year_count")
    private Integer receivedInYearCount;

    @Column(name = "received_in_year_total_minor")
    private Long receivedInYearTotalMinor;

    @Column(name = "includes_unpaired_payments", nullable = false)
    private boolean includesUnpairedPayments;

    @Column(name = "unpaired_count")
    private Integer unpairedCount;

    @Column(name = "unpaired_total_minor")
    private Long unpairedTotalMinor;

    @Column(name = "includes_bank_import", nullable = false)
    private boolean includesBankImport;

    @Column(name = "bank_last_succeeded_at")
    private Instant bankLastSucceededAt;

    @Column(name = "bank_last_failure_at")
    private Instant bankLastFailureAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "bank_last_failure_kind", length = 32)
    private ImportFailureKind bankLastFailureKind;

    protected ReportDeliveryJpaEntity() {
    }

    static ReportDeliveryJpaEntity of(UUID id, ReportDelivery delivery) {
        ReportDeliveryJpaEntity entity = new ReportDeliveryJpaEntity();
        entity.id = id;
        entity.reportMonth = delivery.month().firstDay();
        entity.sentAt = delivery.sentAt();
        entity.byHand = delivery.byHand();
        entity.recipientCount = (short) delivery.recipientCount();
        ReportContent content = delivery.content();
        content.donors().ifPresent(donors -> {
            entity.includesDonors = true;
            entity.registeredDonors = donors.registered();
            entity.newDonors = donors.newInMonth();
        });
        content.donations().ifPresent(donations -> {
            entity.includesDonations = true;
            entity.receivedCount = donations.received().count();
            entity.receivedTotalMinor = donations.received().total().amountMinor();
            entity.pairedCount = donations.paired().count();
            entity.pairedTotalMinor = donations.paired().total().amountMinor();
            entity.receivedInYearCount = donations.receivedInYear().count();
            entity.receivedInYearTotalMinor = donations.receivedInYear().total().amountMinor();
        });
        content.unpairedPayments().ifPresent(unpaired -> {
            entity.includesUnpairedPayments = true;
            entity.unpairedCount = unpaired.count();
            entity.unpairedTotalMinor = unpaired.total().amountMinor();
        });
        content.bankImport().ifPresent(bank -> {
            entity.includesBankImport = true;
            entity.bankLastSucceededAt = bank.lastSucceededAt().orElse(null);
            bank.lastFailure().ifPresent(failure -> {
                entity.bankLastFailureAt = failure.attemptedAt();
                entity.bankLastFailureKind = failure.kind();
            });
        });
        return entity;
    }

    ReportDelivery toDomain() {
        return new ReportDelivery(new ReportMonth(YearMonth.from(reportMonth)), sentAt, byHand, recipientCount, new ReportContent(
                includesDonors ? Optional.of(new DonorCounts(registeredDonors, newDonors)) : Optional.empty(),
                includesDonations ? Optional.of(new DonationTallies(tally(receivedCount, receivedTotalMinor), tally(pairedCount, pairedTotalMinor),
                        tally(receivedInYearCount, receivedInYearTotalMinor))) : Optional.empty(),
                includesUnpairedPayments ? Optional.of(tally(unpairedCount, unpairedTotalMinor)) : Optional.empty(),
                includesBankImport ? Optional.of(bankImport()) : Optional.empty()));
    }

    private BankImportStatus bankImport() {
        Optional<ImportFailure> failure = Optional.ofNullable(bankLastFailureKind).map(kind -> new ImportFailure(kind, bankLastFailureAt));
        return new BankImportStatus(Optional.ofNullable(bankLastSucceededAt), failure);
    }

    private static Tally tally(int count, long totalMinor) {
        return new Tally(count, Money.czk(totalMinor));
    }
}
