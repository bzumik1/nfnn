package cz.novanadeje.app.donations.domain.importing;

import java.time.LocalDate;

public record ImportPeriod(LocalDate from, LocalDate to) {

    public ImportPeriod {
        if (from == null || to == null) {
            throw new IllegalArgumentException("An import period needs both a start and an end");
        }
        if (to.isBefore(from)) {
            throw new IllegalArgumentException("The import period ends on " + to + ", before it starts on " + from);
        }
    }

    public boolean adjoinsOrOverlaps(ImportPeriod other) {
        return !other.from.isAfter(to.plusDays(1)) && !other.to.isBefore(from.minusDays(1));
    }

    public boolean contains(ImportPeriod other) {
        return !other.from.isBefore(from) && !other.to.isAfter(to);
    }

    public ImportPeriod union(ImportPeriod other) {
        return new ImportPeriod(earlier(from, other.from), later(to, other.to));
    }

    @Override
    public String toString() {
        return from + "/" + to;
    }

    private static LocalDate earlier(LocalDate first, LocalDate second) {
        return first.isBefore(second) ? first : second;
    }

    private static LocalDate later(LocalDate first, LocalDate second) {
        return first.isAfter(second) ? first : second;
    }
}
