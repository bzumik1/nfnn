package cz.novanadeje.app.donations.application.report;

import cz.novanadeje.app.donations.domain.report.ReportSettings;
import cz.novanadeje.app.shared.domain.EmailAddress;

public record ReportDefaults(String recipient) {

    public ReportDefaults {
        if (!EmailAddress.isValid(recipient)) {
            throw new IllegalArgumentException("REPORT_RECIPIENT (app.donations.report.recipient) must be an e-mail address");
        }
        recipient = new EmailAddress(recipient).value();
    }

    public ReportSettings settings() {
        return ReportSettings.defaults(new EmailAddress(recipient));
    }
}
