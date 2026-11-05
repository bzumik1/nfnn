package cz.novanadeje.app.donations.application.report;

import cz.novanadeje.app.donations.domain.FoundationCalendar;
import cz.novanadeje.app.donations.domain.bank.BankPaymentRepository;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;
import cz.novanadeje.app.donations.domain.report.ActivitySince;
import cz.novanadeje.app.donations.domain.report.Tally;
import cz.novanadeje.app.donations.domain.report.YearOverview;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;
import java.time.YearMonth;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.SortedSet;
import java.util.TreeSet;
import java.util.stream.Collectors;
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
        List<Year> years = offeredYears(today, donations.findReceivedYearsNewestFirst(), payments.findBookedYearsNewestFirst());
        Year year = requested.orElse(years.getFirst());
        List<Long> registrations = monthStartsOf(year).stream().map(donorRecords::countRegisteredBefore).toList();
        return new OverviewView(YearOverview.compile(year, today, donations.findReceivedOnBetween(year.atDay(1), lastDayOf(year)),
                payments.findUnpairedBookedBetween(year.atDay(1), lastDayOf(year)), registrations), years);
    }

    public List<YearOverview> everyOfferedYear(List<Donation> received, List<BankPayment> booked, List<DonorRecord> records) {
        LocalDate today = FoundationCalendar.today(clock);
        Set<BankPaymentId> paired = received.stream().flatMap(donation -> donation.bankPayment().stream()).collect(Collectors.toSet());
        List<BankPayment> unpaired = booked.stream().filter(payment -> !paired.contains(payment.id())).toList();
        List<Instant> registeredAt = records.stream().map(DonorRecord::registeredAt).toList();
        return offeredYears(today, received.stream().map(donation -> Year.from(donation.receivedOn())).toList(),
                booked.stream().map(payment -> Year.from(payment.bookedOn())).toList()).stream()
                .map(year -> YearOverview.compile(year, today,
                        received.stream().filter(donation -> Year.from(donation.receivedOn()).equals(year)).toList(),
                        unpaired.stream().filter(payment -> Year.from(payment.bookedOn()).equals(year)).toList(),
                        monthStartsOf(year).stream().map(start -> registeredBefore(registeredAt, start)).toList()))
                .toList();
    }

    private static List<Year> offeredYears(LocalDate today, List<Year> received, List<Year> booked) {
        SortedSet<Year> offered = new TreeSet<>(Comparator.reverseOrder());
        offered.add(Year.from(today));
        offered.addAll(received);
        offered.addAll(booked);
        return List.copyOf(offered);
    }

    private static List<Instant> monthStartsOf(Year year) {
        return IntStream.rangeClosed(0, YearOverview.MONTH_BOUNDARIES - 1)
                .mapToObj(offset -> YearMonth.of(year.getValue(), 1).plusMonths(offset).atDay(1).atStartOfDay(FoundationCalendar.ZONE).toInstant())
                .toList();
    }

    private static LocalDate lastDayOf(Year year) {
        return year.atMonth(12).atEndOfMonth();
    }

    private static long registeredBefore(List<Instant> registrations, Instant end) {
        return registrations.stream().filter(registered -> registered.isBefore(end)).count();
    }

    @Transactional(readOnly = true)
    public ActivitySince since(Instant from) {
        return new ActivitySince(from, tally(payments.findImportedSince(from)), tally(payments.findUnpairedImportedSince(from)),
                donorRecords.countRegisteredSince(from));
    }

    private static Tally tally(List<BankPayment> found) {
        return Tally.of(found.stream().map(BankPayment::amount).toList());
    }
}
