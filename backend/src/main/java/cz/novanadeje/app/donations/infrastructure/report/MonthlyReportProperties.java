package cz.novanadeje.app.donations.infrastructure.report;

import cz.novanadeje.app.shared.domain.EmailAddress;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("app.donations.report")
public record MonthlyReportProperties(String cron, String recipient) {

    public MonthlyReportProperties {
        if (!EmailAddress.isValid(recipient)) {
            throw new IllegalArgumentException("REPORT_RECIPIENT (app.donations.report.recipient) must be an e-mail address, but is '"
                    + recipient + "'");
        }
        recipient = new EmailAddress(recipient).value();
    }
}
