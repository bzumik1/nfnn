package cz.novanadeje.app.donations.domain.report;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class InvalidReportRecipient extends RuleViolation {

    public static final String CODE = "donations/report-recipient-invalid";

    public InvalidReportRecipient() {
        super(CODE, "A report recipient is not an e-mail address");
    }
}
