package cz.novanadeje.app.donations.domain.importing;

import java.time.LocalDate;
import java.util.Optional;

public final class ImportPlanner {

    private ImportPlanner() {
    }

    public static ImportPlan plan(ImportCoverage coverage, LocalDate today, ImportSettings settings, ImportTrigger trigger) {
        LocalDate servableFrom = today.minus(settings.historyWindow());
        return switch (trigger) {
            case HOURLY, ON_DEMAND -> hourly(coverage, today, settings, servableFrom);
            case STARTUP -> startup(coverage, today, settings, servableFrom);
        };
    }

    private static ImportPlan hourly(ImportCoverage coverage, LocalDate today, ImportSettings settings, LocalDate servableFrom) {
        LocalDate from = coverage.isEmpty() ? servableFrom : later(coverage.coveredTo().minus(settings.overlap()), servableFrom);
        return new ImportPlan(new ImportPeriod(earlier(from, today), today), false);
    }

    private static ImportPlan startup(ImportCoverage coverage, LocalDate today, ImportSettings settings, LocalDate servableFrom) {
        Optional<LocalDate> historyFrom = settings.historyFrom();
        LocalDate desiredFrom = coverage.isEmpty()
                ? historyFrom.orElse(servableFrom)
                : coverage.coveredTo().minus(settings.overlap());
        if (historyFrom.isPresent() && !coverage.isEmpty() && historyFrom.get().isBefore(coverage.coveredFrom())) {
            desiredFrom = historyFrom.get();
        }
        desiredFrom = earlier(desiredFrom, today);
        return new ImportPlan(new ImportPeriod(desiredFrom, today), desiredFrom.isBefore(servableFrom));
    }

    private static LocalDate earlier(LocalDate first, LocalDate second) {
        return first.isBefore(second) ? first : second;
    }

    private static LocalDate later(LocalDate first, LocalDate second) {
        return first.isAfter(second) ? first : second;
    }
}
