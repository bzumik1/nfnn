package cz.novanadeje.app.donations.domain.importing;

import java.util.Optional;

public record CoverageChange(ImportCoverage coverage, Optional<ImportPeriod> gap) {

    public CoverageChange {
        if (coverage == null || gap == null) {
            throw new IllegalArgumentException("A coverage change needs the coverage and the optional gap");
        }
    }
}
