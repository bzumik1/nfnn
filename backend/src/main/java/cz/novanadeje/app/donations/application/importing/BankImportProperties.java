package cz.novanadeje.app.donations.application.importing;

import cz.novanadeje.app.donations.domain.importing.ImportSettings;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.LocalDate;
import java.time.Period;
import java.time.format.DateTimeParseException;
import java.util.Optional;

@ConfigurationProperties("app.donations.import")
public record BankImportProperties(Period overlap, Period historyWindow, String historyFrom) {

    public BankImportProperties {
        historyStart(historyFrom);
    }

    public ImportSettings toSettings() {
        return new ImportSettings(overlap, historyWindow, historyStart(historyFrom));
    }

    private static Optional<LocalDate> historyStart(String historyFrom) {
        if (historyFrom == null || historyFrom.isBlank()) {
            return Optional.empty();
        }
        try {
            return Optional.of(LocalDate.parse(historyFrom.trim()));
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException(
                    "FIO_HISTORY_FROM must be a date in the form YYYY-MM-DD, e.g. 2025-01-01, but is '" + historyFrom + "'", e);
        }
    }
}
