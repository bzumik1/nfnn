package cz.novanadeje.app.donations.domain.importing;

public record ImportPlan(ImportPeriod period, boolean needsUnlockedHistory) {

    public ImportPlan {
        if (period == null) {
            throw new IllegalArgumentException("An import plan needs a period");
        }
    }
}
