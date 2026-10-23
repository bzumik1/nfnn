package cz.novanadeje.app.donations.application.report;

import cz.novanadeje.app.donations.domain.FoundationCalendar;
import cz.novanadeje.app.donations.domain.bank.BankPaymentRepository;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.report.YearOverview;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.time.Year;
import java.time.YearMonth;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.SortedSet;
import java.util.TreeSet;
import java.util.stream.IntStream;

@Service
public class AdminOverviewService {

    private final DonorRecordRepository donorRecords;
    private final DonationRepository donations;
    private final BankPaymentRepository payments;
    private final Clock clock;

    public AdminOverviewService(DonorRecordRepository donorRecords, DonationRepository donations, BankPaymentRepository payments, Clock clock) {
        this.donorRecords = donorRecords;
        this.donations = donations;
        this.payments = payments;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public OverviewView overview(Optional<Year> requested) {
        LocalDate today = FoundationCalendar.today(clock);
        Year current = Year.from(today);
        SortedSet<Year> offered = new TreeSet<>(Comparator.reverseOrder());
        offered.add(current);
        offered.addAll(donations.findReceivedYearsNewestFirst());
        offered.addAll(payments.findBookedYearsNewestFirst());
        List<Year> years = List.copyOf(offered);
        Year year = requested.orElse(years.getFirst());
        LocalDate firstDay = year.atDay(1);
        LocalDate lastDay = year.atMonth(12).atEndOfMonth();
        List<Long> registrations = IntStream.rangeClosed(0, YearOverview.MONTH_BOUNDARIES - 1)
                .mapToObj(offset -> YearMonth.of(year.getValue(), 1).plusMonths(offset).atDay(1).atStartOfDay(FoundationCalendar.ZONE).toInstant())
                .map(donorRecords::countRegisteredBefore)
                .toList();
        return new OverviewView(YearOverview.compile(year, today, donations.findReceivedOnBetween(firstDay, lastDay),
                payments.findUnpairedBookedBetween(firstDay, lastDay), registrations), years);
    }
}
