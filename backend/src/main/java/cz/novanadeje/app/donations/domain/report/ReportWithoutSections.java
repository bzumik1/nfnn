package cz.novanadeje.app.donations.domain.report;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

public class ReportWithoutSections extends RuleViolation {

    public static final String CODE = "donations/report-section-required";

    public ReportWithoutSections() {
        super(CODE, "The report has at least one section");
    }
}
