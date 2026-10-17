package cz.novanadeje.app.donations.application.importing;

import cz.novanadeje.app.donations.domain.importing.ImportCoverage;
import cz.novanadeje.app.donations.domain.importing.ImportFailureKind;
import cz.novanadeje.app.donations.domain.importing.ImportPeriod;
import cz.novanadeje.app.donations.domain.importing.ImportTrigger;

import java.util.Optional;

public record ImportReport(ImportTrigger trigger, ImportPeriod requested, boolean needsUnlockedHistory, Optional<ImportPeriod> reported,
                           ImportCoverage coverage, ImportCounts counts, Optional<ImportFailureKind> failure,
                           Optional<FollowUp> followUp) {

    public boolean completed() {
        return failure.isEmpty();
    }
}
