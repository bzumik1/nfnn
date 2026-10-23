package cz.novanadeje.app.donations.application.importing;

import cz.novanadeje.app.donations.domain.importing.ImportAlertRepository;
import cz.novanadeje.app.donations.domain.importing.WaitingImportAlert;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Clock;

@Service
public class ImportAlertDelivery {

    private static final Logger log = LoggerFactory.getLogger(ImportAlertDelivery.class);

    private final ImportAlertRepository alerts;
    private final ImportAlertSender sender;
    private final Clock clock;

    public ImportAlertDelivery(ImportAlertRepository alerts, ImportAlertSender sender, Clock clock) {
        this.alerts = alerts;
        this.sender = sender;
        this.clock = clock;
    }

    public void deliverWaiting() {
        for (WaitingImportAlert waiting : alerts.waiting()) {
            if (!sender.send(waiting.alert())) {
                log.warn("Fio import alert {} was not delivered; it is sent again after the next import", waiting.id());
                return;
            }
            alerts.markSent(waiting.id(), clock.instant());
        }
    }
}
