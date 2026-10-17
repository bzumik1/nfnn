package cz.novanadeje.app.donations.domain.importing;

import java.time.LocalDate;
import java.util.Optional;

public record ImportCoverage(LocalDate coveredFrom, LocalDate coveredTo) {

    private static final ImportCoverage NONE = new ImportCoverage(null, null);

    public ImportCoverage {
        if ((coveredFrom == null) != (coveredTo == null)) {
            throw new IllegalArgumentException("A coverage has both bounds or none");
        }
        if (coveredFrom != null && coveredTo.isBefore(coveredFrom)) {
            throw new IllegalArgumentException("The coverage ends on " + coveredTo + ", before it starts on " + coveredFrom);
        }
    }

    public static ImportCoverage none() {
        return NONE;
    }

    public static ImportCoverage of(ImportPeriod period) {
        return new ImportCoverage(period.from(), period.to());
    }

    public boolean isEmpty() {
        return coveredFrom == null;
    }

    public Optional<ImportPeriod> period() {
        return isEmpty() ? Optional.empty() : Optional.of(new ImportPeriod(coveredFrom, coveredTo));
    }

    public CoverageChange extendedBy(ImportPeriod covered) {
        Optional<ImportPeriod> current = period();
        if (current.isEmpty()) {
            return new CoverageChange(of(covered), Optional.empty());
        }
        ImportPeriod existing = current.get();
        if (existing.adjoinsOrOverlaps(covered)) {
            return new CoverageChange(of(existing.union(covered)), Optional.empty());
        }
        if (covered.from().isAfter(existing.to())) {
            return new CoverageChange(of(covered), Optional.of(new ImportPeriod(existing.to().plusDays(1), covered.from().minusDays(1))));
        }
        return new CoverageChange(this, Optional.of(new ImportPeriod(covered.to().plusDays(1), existing.from().minusDays(1))));
    }

    @Override
    public String toString() {
        return isEmpty() ? "nothing" : coveredFrom + "/" + coveredTo;
    }
}
