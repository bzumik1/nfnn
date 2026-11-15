package cz.novanadeje.app.donations.infrastructure.report;

import cz.novanadeje.app.donations.application.report.ReportSettingsService;
import cz.novanadeje.app.shared.application.alert.AlertRecipients;
import cz.novanadeje.app.shared.domain.EmailAddress;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
class ReportRecipientsAlertAdapter implements AlertRecipients {

    private final ReportSettingsService settings;

    ReportRecipientsAlertAdapter(ReportSettingsService settings) {
        this.settings = settings;
    }

    @Override
    public List<EmailAddress> emailAddresses() {
        return settings.recipients().addresses();
    }
}
