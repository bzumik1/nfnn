package cz.novanadeje.app.operations.application.backup;

import cz.novanadeje.app.operations.domain.backup.BackupAlertRepository;
import cz.novanadeje.app.operations.domain.backup.WaitingBackupAlert;
import cz.novanadeje.app.shared.application.alert.AlertRecipients;
import cz.novanadeje.app.shared.domain.EmailAddress;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionOperations;

import java.time.Clock;
import java.util.List;

@Service
public class BackupAlertDelivery {

    private static final Logger log = LoggerFactory.getLogger(BackupAlertDelivery.class);

    private final BackupAlertRepository alerts;
    private final AlertRecipients recipients;
    private final BackupAlertSender sender;
    private final TransactionOperations transactions;
    private final Clock clock;

    public BackupAlertDelivery(BackupAlertRepository alerts, AlertRecipients recipients, BackupAlertSender sender, TransactionOperations transactions,
                               Clock clock) {
        this.alerts = alerts;
        this.recipients = recipients;
        this.sender = sender;
        this.transactions = transactions;
        this.clock = clock;
    }

    public void deliverWaiting(LastBackupRuns lastRuns) {
        List<WaitingBackupAlert> waiting = alerts.waiting();
        if (waiting.isEmpty()) {
            return;
        }
        List<EmailAddress> addresses = recipients.emailAddresses();
        for (WaitingBackupAlert alert : waiting) {
            if (!sender.send(alert.alert(), lastRuns, addresses)) {
                log.warn("Backup alert {} was not delivered; it is sent again after the next backup check", alert.id());
                return;
            }
            transactions.executeWithoutResult(status -> alerts.markSent(alert.id(), clock.instant()));
        }
    }
}
