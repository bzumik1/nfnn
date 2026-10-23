package cz.novanadeje.app.donations.domain.report;

import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.importing.BankImportState;

import java.time.LocalDate;
import java.util.List;
import java.util.function.Predicate;

public record MonthlyReport(ReportMonth month, DonorCounts donors, Tally pairedInMonth, Tally unpairedInMonth, Tally receivedInYear,
                            BankImportStatus bankImport) {

    public MonthlyReport {
        if (month == null || donors == null || pairedInMonth == null || unpairedInMonth == null || receivedInYear == null
                || bankImport == null) {
            throw new IllegalArgumentException("A monthly report has every one of its figures");
        }
    }

    public Tally receivedInMonth() {
        return pairedInMonth.plus(unpairedInMonth);
    }

    public static MonthlyReport compile(ReportMonth month, DonorCounts donors, List<Donation> donations, List<BankPayment> unpairedPayments,
                                        BankImportState importState) {
        List<Donation> received = donations.stream().filter(Donation::isReceived).toList();
        return new MonthlyReport(month, donors,
                donationTally(received, donation -> month.contains(donation.receivedOn())),
                paymentTally(unpairedPayments, month::contains),
                donationTally(received, donation -> month.coversYearToDate(donation.receivedOn()))
                        .plus(paymentTally(unpairedPayments, month::coversYearToDate)),
                BankImportStatus.of(importState));
    }

    private static Tally donationTally(List<Donation> received, Predicate<Donation> counted) {
        return Tally.of(received.stream().filter(counted).map(Donation::amount).toList());
    }

    private static Tally paymentTally(List<BankPayment> payments, Predicate<LocalDate> bookedWithin) {
        return Tally.of(payments.stream().filter(payment -> bookedWithin.test(payment.bookedOn())).map(BankPayment::amount).toList());
    }
}
