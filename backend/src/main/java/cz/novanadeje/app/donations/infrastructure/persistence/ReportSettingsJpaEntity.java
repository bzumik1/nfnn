package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.report.ReportRecipients;
import cz.novanadeje.app.donations.domain.report.ReportSections;
import cz.novanadeje.app.donations.domain.report.ReportSettings;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.Arrays;

@Entity
@Table(name = "donation_report_settings")
class ReportSettingsJpaEntity {

    static final short SINGLETON_ID = 1;
    static final int MAX_RECIPIENTS_LENGTH = 2600;
    private static final String SEPARATOR = ",";

    @Id
    private Short id;

    @Column(name = "recipients", nullable = false, length = MAX_RECIPIENTS_LENGTH)
    private String recipients;

    @Column(name = "send_day", nullable = false)
    private short sendDay;

    @Column(name = "send_hour", nullable = false)
    private short sendHour;

    @Column(name = "include_donors", nullable = false)
    private boolean includeDonors;

    @Column(name = "include_donations", nullable = false)
    private boolean includeDonations;

    @Column(name = "include_unpaired_payments", nullable = false)
    private boolean includeUnpairedPayments;

    @Column(name = "include_bank_import", nullable = false)
    private boolean includeBankImport;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected ReportSettingsJpaEntity() {
    }

    static ReportSettingsJpaEntity fromDomain(ReportSettings settings, Instant updatedAt) {
        ReportSettingsJpaEntity entity = new ReportSettingsJpaEntity();
        entity.id = SINGLETON_ID;
        entity.recipients = String.join(SEPARATOR, settings.recipients().values());
        entity.sendDay = (short) settings.sendDay();
        entity.sendHour = (short) settings.sendHour();
        entity.includeDonors = settings.sections().donors();
        entity.includeDonations = settings.sections().donations();
        entity.includeUnpairedPayments = settings.sections().unpairedPayments();
        entity.includeBankImport = settings.sections().bankImport();
        entity.updatedAt = updatedAt;
        return entity;
    }

    ReportSettings toDomain() {
        return new ReportSettings(ReportRecipients.parse(Arrays.asList(recipients.split(SEPARATOR))), sendDay, sendHour,
                new ReportSections(includeDonors, includeDonations, includeUnpairedPayments, includeBankImport));
    }

    Instant updatedAt() {
        return updatedAt;
    }
}
