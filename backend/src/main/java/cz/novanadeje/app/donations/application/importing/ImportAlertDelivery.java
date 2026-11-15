package cz.novanadeje.app.donations.application.importing;

import cz.novanadeje.app.donations.application.report.ReportSettingsService;
import cz.novanadeje.app.donations.domain.importing.ImportAlertRepository;
import cz.novanadeje.app.donations.domain.importing.WaitingImportAlert;
import cz.novanadeje.app.donations.domain.report.ReportRecipients;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionOperations;

import java.time.Clock;
import java.util.List;

@Service
public class ImportAlertDelivery {

    private static final Logger log = LoggerFactory.getLogger(ImportAlertDelivery.class);

    private final ImportAlertRepository alerts;
    private final ReportSettingsService reportSettings;
    private final ImportAlertSender sender;
    private final TransactionOperations transactions;
    private final Clock clock;

    public ImportAlertDelivery(ImportAlertRepository alerts, ReportSettingsService reportSettings, ImportAlertSender sender,
                               TransactionOperations transactions, Clock clock) {
        this.alerts = alerts;
        this.reportSettings = reportSettings;
        this.sender = sender;
        this.transactions = transactions;
        this.clock = clock;
    }

    public void deliverWaiting() {
        List<WaitingImportAlert> waiting = alerts.waiting();
        if (waiting.isEmpty()) {
            return;
        }
        ReportRecipients recipients = reportSettings.recipients();
        for (WaitingImportAlert alert : waiting) {
            if (!sender.send(alert.alert(), recipients)) {
                log.warn("Fio import alert {} was not delivered; it is sent again after the next import", alert.id());
                return;
            }
            transactions.executeWithoutResult(status -> alerts.markSent(alert.id(), clock.instant()));
        }
    }
}
