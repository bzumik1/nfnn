package cz.novanadeje.app.donations.domain.receipt;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

import java.time.Year;

public class YearNotYetCompleted extends RuleViolation {

    public static final String CODE = "donations/year-not-yet-completed";

    public YearNotYetCompleted(Year year) {
        super(CODE, "The year " + year + " is not completed yet");
    }
}
