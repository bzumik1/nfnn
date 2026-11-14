package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.receipt.YearlyReceiptAnnouncementRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.time.Year;

@Repository
class JpaYearlyReceiptAnnouncementRepository implements YearlyReceiptAnnouncementRepository {

    private final YearlyReceiptAnnouncementJpaRepository jpa;

    JpaYearlyReceiptAnnouncementRepository(YearlyReceiptAnnouncementJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public boolean markAnnounced(Year year, Instant at) {
        return jpa.insertIgnoringAnnouncedYear(year.getValue(), at) == 1;
    }
}
