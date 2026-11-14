package cz.novanadeje.app.operations.application.release;

import cz.novanadeje.app.operations.domain.release.Release;
import cz.novanadeje.app.operations.domain.release.ReleaseCheckFailure;

public sealed interface ReleaseCheckOutcome {

    record Found(Release latest) implements ReleaseCheckOutcome {
    }

    record Failed(ReleaseCheckFailure failure, String outcome) implements ReleaseCheckOutcome {
    }
}
