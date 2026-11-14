package cz.novanadeje.app.donations.infrastructure.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "donation_yearly_receipt_announcement")
class YearlyReceiptAnnouncementJpaEntity {

    @Id
    @Column(name = "receipt_year")
    private int receiptYear;

    @Column(name = "announced_at", nullable = false)
    private Instant announcedAt;

    protected YearlyReceiptAnnouncementJpaEntity() {
    }
}
