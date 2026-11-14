package cz.novanadeje.app.operations.domain.release;

import java.time.Instant;
import java.util.Optional;

public record ReleaseStatus(Optional<Release> running, Optional<LatestRelease> latest, Optional<Instant> checkedAt, Optional<Instant> succeededAt,
                            Optional<ReleaseCheckFailure> failure) {

    public ReleaseStatus {
        if (running == null || latest == null || checkedAt == null || succeededAt == null || failure == null) {
            throw new IllegalArgumentException("A release status names what it does not know as empty");
        }
    }

    public boolean updateAvailable() {
        return running.flatMap(current -> latest.filter(newest -> newest.release().isNewerThan(current))).isPresent();
    }
}
