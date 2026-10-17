package cz.novanadeje.app.donations.domain.importing;

import java.time.LocalDate;
import java.time.Period;
import java.util.Optional;

public record ImportSettings(Period overlap, Period historyWindow, Optional<LocalDate> historyFrom) {

    private static final Period DEFAULT_OVERLAP = Period.ofDays(3);
    private static final Period DEFAULT_HISTORY_WINDOW = Period.ofDays(89);

    public ImportSettings {
        if (overlap == null || overlap.isNegative()) {
            throw new IllegalArgumentException("The import overlap must not be negative: " + overlap);
        }
        if (historyWindow == null || historyWindow.isNegative()) {
            throw new IllegalArgumentException("The history window must not be negative: " + historyWindow);
        }
        if (historyFrom == null) {
            throw new IllegalArgumentException("The history start is optional, never null");
        }
    }

    public static ImportSettings defaults() {
        return new ImportSettings(DEFAULT_OVERLAP, DEFAULT_HISTORY_WINDOW, Optional.empty());
    }

    public ImportSettings withHistoryFrom(LocalDate from) {
        return new ImportSettings(overlap, historyWindow, Optional.of(from));
    }
}
