package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.application.signing.ReceiptSigningKeys;
import cz.novanadeje.app.donations.domain.FoundationCalendar;
import cz.novanadeje.app.donations.domain.receipt.FirstReceiptYear;
import cz.novanadeje.app.donations.domain.receipt.ReceiptCalendar;
import cz.novanadeje.app.donations.domain.receipt.ReceiptSignatoryRepository;
import cz.novanadeje.app.donations.domain.receipt.YearlyReceiptAnnouncementRepository;
import cz.novanadeje.app.shared.application.event.YearlyReceiptsReady;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.time.Month;
import java.time.Year;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class YearlyReceiptAnnouncementService {

    private static final Logger log = LoggerFactory.getLogger(YearlyReceiptAnnouncementService.class);

    static final int FIRST_ANNOUNCING_DAY_OF_JANUARY = 2;

    private final YearlyReceiptsService yearlyReceipts;
    private final YearlyReceiptAnnouncementRepository announcements;
    private final ReceiptSigningKeys signingKeys;
    private final ReceiptSignatoryRepository signatories;
    private final FirstReceiptYear firstYear;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public YearlyReceiptAnnouncementService(YearlyReceiptsService yearlyReceipts, YearlyReceiptAnnouncementRepository announcements,
                                            ReceiptSigningKeys signingKeys, ReceiptSignatoryRepository signatories, FirstReceiptYear firstYear,
                                            ApplicationEventPublisher events, Clock clock) {
        this.yearlyReceipts = yearlyReceipts;
        this.announcements = announcements;
        this.signingKeys = signingKeys;
        this.signatories = signatories;
        this.firstYear = firstYear;
        this.events = events;
        this.clock = clock;
    }

    @Transactional
    public Optional<YearlyReceiptAnnouncement> announceDue() {
        LocalDate today = FoundationCalendar.today(clock);
        Year year = ReceiptCalendar.lastCompleted(today);
        if (today.getMonth() != Month.JANUARY || today.getDayOfMonth() < FIRST_ANNOUNCING_DAY_OF_JANUARY || !firstYear.admits(year)
                || !receiptsCanBeIssued(year) || !announcements.markAnnounced(year, clock.instant())) {
            return Optional.empty();
        }
        Set<UUID> donors = yearlyReceipts.candidates(year).donors().stream().map(candidate -> candidate.donor().value())
                .collect(Collectors.toUnmodifiableSet());
        if (!donors.isEmpty()) {
            events.publishEvent(new YearlyReceiptsReady(donors, clock.instant()));
        }
        return Optional.of(new YearlyReceiptAnnouncement(year, donors.size()));
    }

    private boolean receiptsCanBeIssued(Year year) {
        if (!signingKeys.overview().currentKeyPublished()) {
            log.warn("Yearly receipts of {} are not announced yet: the server's receipt signing key is not published", year);
            return false;
        }
        if (signatories.current().isEmpty()) {
            log.warn("Yearly receipts of {} are not announced yet: nobody is chosen to sign the receipts", year);
            return false;
        }
        return true;
    }
}
