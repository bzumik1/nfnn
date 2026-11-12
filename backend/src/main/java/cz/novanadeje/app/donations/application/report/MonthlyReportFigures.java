package cz.novanadeje.app.donations.application.report;

import cz.novanadeje.app.donations.domain.bank.BankPaymentRepository;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.importing.BankImportStateRepository;
import cz.novanadeje.app.donations.domain.report.DonorCounts;
import cz.novanadeje.app.donations.domain.report.MonthlyReport;
import cz.novanadeje.app.donations.domain.report.ReportMonth;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Component
public class MonthlyReportFigures {

    private final DonorRecordRepository donorRecords;
    private final DonationRepository donations;
    private final BankPaymentRepository payments;
    private final BankImportStateRepository importStates;

    public MonthlyReportFigures(DonorRecordRepository donorRecords, DonationRepository donations, BankPaymentRepository payments,
                                BankImportStateRepository importStates) {
        this.donorRecords = donorRecords;
        this.donations = donations;
        this.payments = payments;
        this.importStates = importStates;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ, propagation = Propagation.REQUIRES_NEW)
    public MonthlyReport compile(ReportMonth month) {
        DonorCounts donors = DonorCounts.between(donorRecords.countRegisteredBefore(month.start()), donorRecords.countRegisteredBefore(month.end()));
        return MonthlyReport.compile(month, donors,
                donations.findReceivedOnBetween(month.firstDayOfYear(), month.lastDay()),
                payments.findUnpairedBookedBetween(month.firstDayOfYear(), month.lastDay()),
                importStates.current());
    }
}
