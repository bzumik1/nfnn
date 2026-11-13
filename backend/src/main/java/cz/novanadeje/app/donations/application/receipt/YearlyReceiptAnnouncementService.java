package cz.novanadeje.app.donations.application.receipt;

import cz.novanadeje.app.donations.domain.FoundationCalendar;
import cz.novanadeje.app.donations.domain.receipt.FirstReceiptYear;
import cz.novanadeje.app.donations.domain.receipt.ReceiptCalendar;
import cz.novanadeje.app.donations.domain.receipt.YearlyReceiptAnnouncementRepository;
import cz.novanadeje.app.shared.application.event.YearlyReceiptsReady;
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

    static final int FIRST_ANNOUNCING_DAY_OF_JANUARY = 2;

    private final YearlyReceiptsService yearlyReceipts;
    private final YearlyReceiptAnnouncementRepository announcements;
    private final FirstReceiptYear firstYear;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public YearlyReceiptAnnouncementService(YearlyReceiptsService yearlyReceipts, YearlyReceiptAnnouncementRepository announcements,
                                            FirstReceiptYear firstYear, ApplicationEventPublisher events, Clock clock) {
        this.yearlyReceipts = yearlyReceipts;
        this.announcements = announcements;
        this.firstYear = firstYear;
        this.events = events;
        this.clock = clock;
    }

    @Transactional
    public Optional<YearlyReceiptAnnouncement> announceDue() {
        LocalDate today = FoundationCalendar.today(clock);
        Year year = ReceiptCalendar.lastCompleted(today);
        if (today.getMonth() != Month.JANUARY || today.getDayOfMonth() < FIRST_ANNOUNCING_DAY_OF_JANUARY || !firstYear.admits(year)
                || !announcements.markAnnounced(year, clock.instant())) {
            return Optional.empty();
        }
        Set<UUID> donors = yearlyReceipts.candidates(year).donors().stream().map(candidate -> candidate.donor().value())
                .collect(Collectors.toUnmodifiableSet());
        if (!donors.isEmpty()) {
            events.publishEvent(new YearlyReceiptsReady(donors, clock.instant()));
        }
        return Optional.of(new YearlyReceiptAnnouncement(year, donors.size()));
    }
}
