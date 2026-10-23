package cz.novanadeje.app.donations.application.report;

import cz.novanadeje.app.donations.domain.FoundationCalendar;
import cz.novanadeje.app.donations.domain.report.MonthlyReportLog;
import cz.novanadeje.app.donations.domain.report.ReportMonth;
import cz.novanadeje.app.donations.domain.report.ReportSections;
import cz.novanadeje.app.donations.domain.report.ReportSettings;
import cz.novanadeje.app.donations.domain.report.ReportSettingsRepository;
import cz.novanadeje.app.donations.domain.report.SentReport;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class ReportSettingsService {

    static final String CHANGE_ACTION = "CHANGE_REPORT_SETTINGS";

    private static final Logger log = LoggerFactory.getLogger(ReportSettingsService.class);

    private final ReportSettingsRepository settings;
    private final MonthlyReportLog reportLog;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public ReportSettingsService(ReportSettingsRepository settings, MonthlyReportLog reportLog, ApplicationEventPublisher events, Clock clock) {
        this.settings = settings;
        this.reportLog = reportLog;
        this.events = events;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public ReportAdministrationView view() {
        ReportSettings current = settings.current();
        List<SentReport> sent = reportLog.sentReportsNewestFirst();
        LocalDate today = FoundationCalendar.today(clock);
        return new ReportAdministrationView(current, settings.lastChangedAt(), sent, nextReport(current, sent, today), ReportMonth.previousTo(today));
    }

    @Transactional
    public ReportSettings change(UUID adminId, ReportSettings changed) {
        Instant now = clock.instant();
        settings.save(changed, now);
        events.publishEvent(new AdminActionPerformed(adminId, CHANGE_ACTION, Optional.empty(),
                "Nastavení měsíčního přehledu změněno: příjemci " + String.join(", ", changed.recipients().values())
                        + "; odesílá se " + changed.sendDay() + ". den v měsíci v " + changed.sendHour() + ":00; části " + czechSections(changed.sections()), now));
        log.info("Admin {} changed the monthly report settings: {} recipient(s), day {} at {}:00, sections {}", adminId, changed.recipients().count(),
                changed.sendDay(), changed.sendHour(), changed.sections().names());
        return changed;
    }

    private static String czechSections(ReportSections sections) {
        List<String> names = new ArrayList<>();
        if (sections.donors()) {
            names.add("dárci");
        }
        if (sections.donations()) {
            names.add("dary");
        }
        if (sections.unpairedPayments()) {
            names.add("platby bez dárce");
        }
        if (sections.bankImport()) {
            names.add("stahování z banky");
        }
        return String.join(", ", names);
    }

    private ReportAdministrationView.NextReport nextReport(ReportSettings current, List<SentReport> sent, LocalDate today) {
        ReportMonth previous = ReportMonth.previousTo(today);
        boolean previousSent = sent.stream().anyMatch(report -> report.month().equals(previous));
        ReportMonth next = previousSent ? new ReportMonth(YearMonth.from(today)) : previous;
        return new ReportAdministrationView.NextReport(next, current.sendDateFor(next));
    }
}
