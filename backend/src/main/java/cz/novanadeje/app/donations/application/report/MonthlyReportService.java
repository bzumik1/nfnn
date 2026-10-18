package cz.novanadeje.app.donations.application.report;

import cz.novanadeje.app.donations.domain.FoundationCalendar;
import cz.novanadeje.app.donations.domain.bank.BankPaymentRepository;
import cz.novanadeje.app.donations.domain.donation.DonationRepository;
import cz.novanadeje.app.donations.domain.donor.DonorRecordRepository;
import cz.novanadeje.app.donations.domain.importing.BankImportStateRepository;
import cz.novanadeje.app.donations.domain.report.DonorCounts;
import cz.novanadeje.app.donations.domain.report.MonthlyReport;
import cz.novanadeje.app.donations.domain.report.MonthlyReportLog;
import cz.novanadeje.app.donations.domain.report.ReportMonth;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;

@Service
public class MonthlyReportService {

    private final DonorRecordRepository donorRecords;
    private final DonationRepository donations;
    private final BankPaymentRepository payments;
    private final BankImportStateRepository importStates;
    private final MonthlyReportLog reportLog;
    private final MonthlyReportSender sender;
    private final Clock clock;

    public MonthlyReportService(DonorRecordRepository donorRecords, DonationRepository donations, BankPaymentRepository payments,
                                BankImportStateRepository importStates, MonthlyReportLog reportLog, MonthlyReportSender sender, Clock clock) {
        this.donorRecords = donorRecords;
        this.donations = donations;
        this.payments = payments;
        this.importStates = importStates;
        this.reportLog = reportLog;
        this.sender = sender;
        this.clock = clock;
    }

    @Transactional
    public MonthlyReportOutcome sendDueReport() {
        return sendReportFor(ReportMonth.previousTo(FoundationCalendar.today(clock)));
    }

    @Transactional
    public MonthlyReportOutcome sendReportFor(ReportMonth month) {
        LocalDate today = FoundationCalendar.today(clock);
        if (!month.completedBy(today)) {
            throw new IllegalArgumentException("The month " + month + " has not ended on " + today + "; only an ended month is reported");
        }
        if (!reportLog.recordSending(month, clock.instant())) {
            return MonthlyReportOutcome.alreadySent(month);
        }
        sender.send(compile(month));
        return MonthlyReportOutcome.sent(month);
    }

    private MonthlyReport compile(ReportMonth month) {
        DonorCounts donors = DonorCounts.between(donorRecords.countRegisteredBefore(month.start()), donorRecords.countRegisteredBefore(month.end()));
        return MonthlyReport.compile(month, donors,
                donations.findReceivedOnBetween(month.firstDayOfYear(), month.lastDay()),
                payments.findUnpairedBookedBetween(month.firstDay(), month.lastDay()),
                importStates.current());
    }
}
