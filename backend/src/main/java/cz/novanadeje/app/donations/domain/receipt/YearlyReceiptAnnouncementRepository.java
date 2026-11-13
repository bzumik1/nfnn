package cz.novanadeje.app.donations.domain.receipt;

import java.time.Instant;
import java.time.Year;

public interface YearlyReceiptAnnouncementRepository {

    boolean markAnnounced(Year year, Instant at);
}
