package cz.novanadeje.app.donations.domain.report;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

import java.time.LocalDate;

public class ReportMonthNotEnded extends RuleViolation {

    public static final String CODE = "donations/report-month-not-ended";

    public ReportMonthNotEnded(ReportMonth month, LocalDate today) {
        super(CODE, "The month " + month + " has not ended on " + today + "; only an ended month is reported");
    }
}
