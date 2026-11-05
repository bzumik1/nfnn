package cz.novanadeje.app.donations.domain.importing;

import java.time.LocalDate;

public record HistoryImportStart(LocalDate from) {

    public static final LocalDate EARLIEST = LocalDate.of(2000, 1, 1);

    public HistoryImportStart {
        if (from == null) {
            throw new IllegalArgumentException("A history import needs the day it starts from");
        }
    }

    public static HistoryImportStart of(LocalDate from, LocalDate today) {
        if (from.isAfter(today)) {
            throw new HistoryStartInFuture(from, today);
        }
        if (from.isBefore(EARLIEST)) {
            throw new HistoryStartTooEarly(from);
        }
        return new HistoryImportStart(from);
    }
}
