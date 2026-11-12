package cz.novanadeje.app.donations.domain.importing;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

import java.time.LocalDate;

public class HistoryStartInFuture extends RuleViolation {

    public static final String CODE = "donations/history-start-in-future";

    public HistoryStartInFuture(LocalDate from, LocalDate today) {
        super(CODE, "A history import cannot start on " + from + ", after today " + today);
    }
}
