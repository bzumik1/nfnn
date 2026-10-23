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
import cz.novanadeje.app.donations.domain.report.ReportMonthNotEnded;
import cz.novanadeje.app.donations.domain.report.ReportSettings;
import cz.novanadeje.app.donations.domain.report.ReportSettingsRepository;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

@Service
public class MonthlyReportService {

    static final String SEND_ACTION = "SEND_MONTHLY_REPORT";

    private static final Logger log = LoggerFactory.getLogger(MonthlyReportService.class);

    private final DonorRecordRepository donorRecords;
    private final DonationRepository donations;
    private final BankPaymentRepository payments;
    private final BankImportStateRepository importStates;
    private final MonthlyReportLog reportLog;
    private final ReportSettingsRepository settings;
    private final MonthlyReportSender sender;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public MonthlyReportService(DonorRecordRepository donorRecords, DonationRepository donations, BankPaymentRepository payments,
                                BankImportStateRepository importStates, MonthlyReportLog reportLog, ReportSettingsRepository settings,
                                MonthlyReportSender sender, ApplicationEventPublisher events, Clock clock) {
        this.donorRecords = donorRecords;
        this.donations = donations;
        this.payments = payments;
        this.importStates = importStates;
        this.reportLog = reportLog;
        this.settings = settings;
        this.sender = sender;
        this.events = events;
        this.clock = clock;
    }

    @Transactional
    public MonthlyReportOutcome sendDueReport() {
        LocalDate today = FoundationCalendar.today(clock);
        ReportMonth month = ReportMonth.previousTo(today);
        ReportSettings current = settings.current();
        if (!current.dueOn(today)) {
            return MonthlyReportOutcome.notDue(month);
        }
        return send(month, current);
    }

    @Transactional
    public MonthlyReportOutcome sendReportFor(ReportMonth month) {
        requireEnded(month);
        return send(month, settings.current());
    }

    @Transactional
    public ManualReportDelivery resend(UUID adminId, ReportMonth month) {
        requireEnded(month);
        Instant now = clock.instant();
        ReportSettings current = settings.current();
        reportLog.recordSending(month, now);
        sender.send(compile(month), current);
        events.publishEvent(new AdminActionPerformed(adminId, SEND_ACTION, Optional.empty(),
                "Monthly report for " + month + " sent by hand to " + String.join(", ", current.recipients().values()), now));
        log.info("Admin {} sent the monthly report for {} by hand to {} recipient(s)", adminId, month, current.recipients().count());
        return new ManualReportDelivery(month, current.recipients(), now);
    }

    private MonthlyReportOutcome send(ReportMonth month, ReportSettings current) {
        if (!reportLog.recordSending(month, clock.instant())) {
            return MonthlyReportOutcome.alreadySent(month);
        }
        sender.send(compile(month), current);
        return MonthlyReportOutcome.sent(month);
    }

    private void requireEnded(ReportMonth month) {
        LocalDate today = FoundationCalendar.today(clock);
        if (!month.completedBy(today)) {
            throw new ReportMonthNotEnded(month, today);
        }
    }

    private MonthlyReport compile(ReportMonth month) {
        DonorCounts donors = DonorCounts.between(donorRecords.countRegisteredBefore(month.start()), donorRecords.countRegisteredBefore(month.end()));
        return MonthlyReport.compile(month, donors,
                donations.findReceivedOnBetween(month.firstDayOfYear(), month.lastDay()),
                payments.findUnpairedBookedBetween(month.firstDay(), month.lastDay()),
                importStates.current());
    }
}
