package cz.novanadeje.app.donations.infrastructure.report;

import cz.novanadeje.app.donations.domain.report.ReportSettingsRepository;
import cz.novanadeje.app.shared.application.alert.AlertRecipients;
import cz.novanadeje.app.shared.domain.EmailAddress;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
class ReportRecipientsAlertAdapter implements AlertRecipients {

    private final ReportSettingsRepository settings;

    ReportRecipientsAlertAdapter(ReportSettingsRepository settings) {
        this.settings = settings;
    }

    @Override
    public List<EmailAddress> emailAddresses() {
        return settings.current().recipients().addresses();
    }
}
