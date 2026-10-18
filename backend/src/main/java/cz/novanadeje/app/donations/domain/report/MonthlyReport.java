package cz.novanadeje.app.donations.domain.report;

import cz.novanadeje.app.donations.domain.bank.BankPayment;
import cz.novanadeje.app.donations.domain.donation.Donation;
import cz.novanadeje.app.donations.domain.importing.BankImportState;

import java.util.List;
import java.util.function.Predicate;

public record MonthlyReport(ReportMonth month, DonorCounts donors, Tally donationsInMonth, Tally donationsInYear, Tally unpairedPaymentsInMonth,
                            BankImportStatus bankImport) {

    public MonthlyReport {
        if (month == null || donors == null || donationsInMonth == null || donationsInYear == null || unpairedPaymentsInMonth == null
                || bankImport == null) {
            throw new IllegalArgumentException("A monthly report has every one of its figures");
        }
    }

    public static MonthlyReport compile(ReportMonth month, DonorCounts donors, List<Donation> donations, List<BankPayment> unpairedPayments,
                                        BankImportState importState) {
        List<Donation> received = donations.stream().filter(Donation::isReceived).toList();
        return new MonthlyReport(month, donors,
                donationTally(received, donation -> month.contains(donation.receivedOn())),
                donationTally(received, donation -> month.coversYearToDate(donation.receivedOn())),
                Tally.of(unpairedPayments.stream().filter(payment -> month.contains(payment.bookedOn())).map(BankPayment::amount).toList()),
                BankImportStatus.of(importState));
    }

    private static Tally donationTally(List<Donation> received, Predicate<Donation> counted) {
        return Tally.of(received.stream().filter(counted).map(Donation::amount).toList());
    }
}
