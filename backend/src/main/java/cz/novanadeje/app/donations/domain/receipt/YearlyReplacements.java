package cz.novanadeje.app.donations.domain.receipt;

import java.util.List;
import java.util.Optional;

public record YearlyReplacements(List<DonationReceipt> activeSingles, Optional<DonationReceipt> latestOutdated) {

    public YearlyReplacements {
        if (activeSingles == null || latestOutdated == null) {
            throw new IllegalArgumentException("The active single receipts and the latest outdated yearly receipt are required");
        }
        activeSingles = List.copyOf(activeSingles);
    }
}
