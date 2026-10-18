package cz.novanadeje.app.donations.application.importing;

import cz.novanadeje.app.donations.domain.importing.ImportSettings;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;
import java.time.LocalDate;
import java.time.Period;
import java.time.format.DateTimeParseException;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@ConfigurationProperties("app.donations.import")
public record BankImportProperties(Period overlap, Period historyWindow, String historyFrom, Duration onDemandCooldown) {

    private static final Pattern DATE_AT_UTC_MIDNIGHT =
            Pattern.compile("(\\d{4}-\\d{2}-\\d{2})(?:[T ]00:00:00(?:Z| \\+0000 UTC)?)?");

    public BankImportProperties {
        historyStart(historyFrom);
        if (onDemandCooldown == null || onDemandCooldown.isNegative()) {
            throw new IllegalArgumentException("app.donations.import.on-demand-cooldown must be zero or positive, but is " + onDemandCooldown);
        }
    }

    public ImportSettings toSettings() {
        return new ImportSettings(overlap, historyWindow, historyStart(historyFrom));
    }

    private static Optional<LocalDate> historyStart(String historyFrom) {
        if (historyFrom == null || historyFrom.isBlank()) {
            return Optional.empty();
        }
        Matcher date = DATE_AT_UTC_MIDNIGHT.matcher(historyFrom.trim());
        if (!date.matches()) {
            throw invalidHistoryFrom(historyFrom, null);
        }
        try {
            return Optional.of(LocalDate.parse(date.group(1)));
        } catch (DateTimeParseException e) {
            throw invalidHistoryFrom(historyFrom, e);
        }
    }

    private static IllegalArgumentException invalidHistoryFrom(String historyFrom, DateTimeParseException cause) {
        return new IllegalArgumentException(
                "FIO_HISTORY_FROM must be a date in the form YYYY-MM-DD, e.g. 2025-01-01, but is '" + historyFrom + "'", cause);
    }
}
