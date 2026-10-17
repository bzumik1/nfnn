package cz.novanadeje.app.donations.application.importing;

import cz.novanadeje.app.donations.domain.importing.ImportSettings;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.LocalDate;
import java.time.Period;
import java.util.Optional;

@ConfigurationProperties("app.donations.import")
public record BankImportProperties(Period overlap, Period historyWindow, String historyFrom) {

    public ImportSettings toSettings() {
        Optional<LocalDate> from = historyFrom == null || historyFrom.isBlank()
                ? Optional.empty()
                : Optional.of(LocalDate.parse(historyFrom.trim()));
        return new ImportSettings(overlap, historyWindow, from);
    }
}
