package cz.novanadeje.app.donations.infrastructure.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "donation_monthly_report")
class MonthlyReportJpaEntity {

    @Id
    @Column(name = "report_month")
    private LocalDate reportMonth;

    @Column(name = "sent_at", nullable = false)
    private Instant sentAt;

    protected MonthlyReportJpaEntity() {
    }

    LocalDate reportMonth() {
        return reportMonth;
    }

    Instant sentAt() {
        return sentAt;
    }
}
