package cz.novanadeje.app.donations.domain.report;

import cz.novanadeje.app.donations.domain.FoundationCalendar;
import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.bank.BankPaymentId;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.donor.DonorRecord;

import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;
import java.time.YearMonth;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.SortedSet;
import java.util.TreeSet;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

public final class AdministrationYears {

    private AdministrationYears() {
    }

    public static List<Year> offeredYears(LocalDate today, List<Year> received, List<Year> booked) {
        SortedSet<Year> offered = new TreeSet<>(Comparator.reverseOrder());
        offered.add(Year.from(today));
        offered.addAll(received);
        offered.addAll(booked);
        return List.copyOf(offered);
    }

    public static List<Instant> monthStartsOf(Year year) {
        return IntStream.rangeClosed(0, YearOverview.MONTH_BOUNDARIES - 1)
                .mapToObj(offset -> YearMonth.of(year.getValue(), 1).plusMonths(offset).atDay(1).atStartOfDay(FoundationCalendar.ZONE).toInstant())
                .toList();
    }

    public static List<YearOverview> everyOfferedYear(LocalDate today, List<Donation> received, List<BankPayment> booked, List<DonorRecord> records) {
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

    private static long registeredBefore(List<Instant> registrations, Instant end) {
        return registrations.stream().filter(registered -> registered.isBefore(end)).count();
    }
}
