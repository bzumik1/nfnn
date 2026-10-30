package cz.novanadeje.app.donations.domain.report;

import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.donation.Donation;

import java.time.LocalDate;
import java.time.Year;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

public record YearOverview(Year year, List<MonthOverview> months, Tally paired, long givingDonors, long newDonors, Tally unpaired,
                           long donorsRegistered) {

    public static final int MONTH_BOUNDARIES = 13;

    public YearOverview {
        if (year == null || months == null || paired == null || unpaired == null) {
            throw new IllegalArgumentException("A year overview has its year and every one of its figures");
        }
        if (newDonors < 0 || donorsRegistered < newDonors) {
            throw new IllegalArgumentException("New donors are part of the registered ones: " + newDonors + " of " + donorsRegistered);
        }
        if (givingDonors < 0 || givingDonors > paired.count()) {
            throw new IllegalArgumentException("Giving donors are between zero and the paired donations: " + givingDonors + " of " + paired.count());
        }
        months = List.copyOf(months);
    }

    public Tally received() {
        return paired.plus(unpaired);
    }

    public static YearOverview compile(Year year, LocalDate today, List<Donation> donations, List<BankPayment> unpairedPayments,
                                       List<Long> registeredBeforeMonthStarts) {
        if (year == null || today == null) {
            throw new IllegalArgumentException("The year and today are required");
        }
        if (registeredBeforeMonthStarts == null || registeredBeforeMonthStarts.size() != MONTH_BOUNDARIES) {
            throw new IllegalArgumentException("The donor counts are given for the start of every month of the year and of the next January");
        }
        List<Donation> received = donations.stream().filter(Donation::isReceived).toList();
        List<MonthOverview> months = new ArrayList<>();
        int started = 0;
        for (int index = 0; index < MONTH_BOUNDARIES - 1; index++) {
            ReportMonth month = new ReportMonth(YearMonth.of(year.getValue(), index + 1));
            if (month.firstDay().isAfter(today)) {
                break;
            }
            long newDonors = registeredBeforeMonthStarts.get(index + 1) - registeredBeforeMonthStarts.get(index);
            if (newDonors < 0) {
                throw new IllegalArgumentException("Donor counts cannot fall from one month to the next");
            }
            List<Donation> ofMonth = received.stream().filter(donation -> month.contains(donation.receivedOn())).toList();
            months.addFirst(new MonthOverview(month,
                    Tally.of(ofMonth.stream().map(Donation::amount).toList()),
                    distinctDonors(ofMonth),
                    newDonors,
                    Tally.of(unpairedPayments.stream().filter(payment -> month.contains(payment.bookedOn())).map(BankPayment::amount).toList())));
            started++;
        }
        long registeredAtStart = registeredBeforeMonthStarts.getFirst();
        long registered = registeredBeforeMonthStarts.get(started);
        List<Donation> ofYear = received.stream().filter(donation -> donation.receivedIn(year)).toList();
        return new YearOverview(year, months,
                Tally.of(ofYear.stream().map(Donation::amount).toList()),
                distinctDonors(ofYear),
                registered - registeredAtStart,
                Tally.of(unpairedPayments.stream().filter(payment -> Year.from(payment.bookedOn()).equals(year)).map(BankPayment::amount).toList()),
                registered);
    }

    private static long distinctDonors(Collection<Donation> donations) {
        return donations.stream().map(Donation::donor).distinct().count();
    }
}
