package cz.novanadeje.app.operations.interfaces.rest;

import cz.novanadeje.app.operations.domain.release.LatestRelease;
import cz.novanadeje.app.operations.domain.release.ReleaseCheckFailure;
import cz.novanadeje.app.operations.domain.release.ReleaseStatus;

import java.time.Instant;

record ReleaseResponse(String running, Latest latest, Instant checkedAt, Instant succeededAt, ReleaseCheckFailure failure, boolean updateAvailable) {

    static ReleaseResponse from(String running, ReleaseStatus status) {
        return new ReleaseResponse(running, status.latest().map(Latest::from).orElse(null), status.checkedAt().orElse(null),
                status.succeededAt().orElse(null), status.failure().orElse(null), status.updateAvailable());
    }

    record Latest(String version, Instant publishedAt) {

        static Latest from(LatestRelease latest) {
            return new Latest(latest.release().toString(), latest.publishedAt());
        }
    }
}
