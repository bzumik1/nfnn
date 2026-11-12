package cz.novanadeje.app.donations.domain.importing;

import cz.novanadeje.app.shared.domain.error.RuleViolation;

import java.time.LocalDate;

public class HistoryStartTooEarly extends RuleViolation {

    public static final String CODE = "donations/history-start-too-early";

    public HistoryStartTooEarly(LocalDate from) {
        super(CODE, "A history import cannot start on " + from + ", before " + HistoryImportStart.EARLIEST);
    }
}
