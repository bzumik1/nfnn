package cz.novanadeje.app.donations.application.report;

import cz.novanadeje.app.donations.domain.FoundationCalendar;
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
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

@Service
public class MonthlyReportService {

    static final String SEND_ACTION = "SEND_MONTHLY_REPORT";

    private static final Logger log = LoggerFactory.getLogger(MonthlyReportService.class);

    private final MonthlyReportFigures figures;
    private final MonthlyReportLog reportLog;
    private final ReportSettingsRepository settings;
    private final MonthlyReportSender sender;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public MonthlyReportService(MonthlyReportFigures figures, MonthlyReportLog reportLog, ReportSettingsRepository settings,
                                MonthlyReportSender sender, ApplicationEventPublisher events, Clock clock) {
        this.figures = figures;
        this.reportLog = reportLog;
        this.settings = settings;
        this.sender = sender;
        this.events = events;
        this.clock = clock;
    }

    @Transactional
    public MonthlyReportOutcome sendDueReport() {
        LocalDateTime now = FoundationCalendar.now(clock);
        ReportMonth month = ReportMonth.previousTo(now.toLocalDate());
        ReportSettings current = settings.current();
        if (!current.dueAt(now)) {
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
        sender.send(figures.compile(month), current);
        events.publishEvent(new AdminActionPerformed(adminId, SEND_ACTION, Optional.empty(),
                "Měsíční přehled za " + month + " ručně odeslán, počet příjemců " + current.recipients().count(), now));
        log.info("Admin {} sent the monthly report for {} by hand to {} recipient(s)", adminId, month, current.recipients().count());
        return new ManualReportDelivery(month, current.recipients(), now);
    }

    private MonthlyReportOutcome send(ReportMonth month, ReportSettings current) {
        if (!reportLog.recordSending(month, clock.instant())) {
            return MonthlyReportOutcome.alreadySent(month);
        }
        sender.send(figures.compile(month), current);
        return MonthlyReportOutcome.sent(month);
    }

    private void requireEnded(ReportMonth month) {
        LocalDate today = FoundationCalendar.today(clock);
        if (!month.completedBy(today)) {
            throw new ReportMonthNotEnded(month, today);
        }
    }
}
