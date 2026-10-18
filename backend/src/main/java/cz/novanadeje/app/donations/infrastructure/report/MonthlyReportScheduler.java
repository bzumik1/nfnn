package cz.novanadeje.app.donations.infrastructure.report;

import cz.novanadeje.app.donations.application.report.MonthlyReportNotDelivered;
import cz.novanadeje.app.donations.application.report.MonthlyReportOutcome;
import cz.novanadeje.app.donations.application.report.MonthlyReportService;
import cz.novanadeje.app.donations.domain.FoundationCalendar;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Conditional;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@Conditional(MonthlyReportScheduleCondition.class)
class MonthlyReportScheduler {

    private static final Logger log = LoggerFactory.getLogger(MonthlyReportScheduler.class);

    private final MonthlyReportService service;

    MonthlyReportScheduler(MonthlyReportService service) {
        this.service = service;
    }

    @Scheduled(cron = "${app.donations.report.cron}", zone = FoundationCalendar.ZONE_ID)
    void checkDueReport() {
        try {
            MonthlyReportOutcome outcome = service.sendDueReport();
            if (outcome.sent()) {
                log.info("Monthly report for {} sent", outcome.month());
            }
        } catch (MonthlyReportNotDelivered notDelivered) {
            log.error("Monthly report for {} could not be sent: {}; retrying at the next check", notDelivered.month(),
                    notDelivered.getCause().getClass().getSimpleName());
        } catch (RuntimeException unexpected) {
            log.error("Monthly report check failed unexpectedly; retrying at the next check", unexpected);
        }
    }
}
