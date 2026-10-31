package cz.novanadeje.app.donations.domain.report;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class RepeatedReportRecipient extends RuleViolation {

    public static final String CODE = "donations/report-recipient-repeated";

    public RepeatedReportRecipient() {
        super(CODE, "A report recipient is listed once");
    }
}
