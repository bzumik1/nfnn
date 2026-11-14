package cz.novanadeje.app.operations.domain.release;

import java.time.Instant;
import java.util.Optional;

public record ReleaseCheck(Optional<LatestRelease> latest, Optional<Instant> checkedAt, Optional<Instant> succeededAt,
                           Optional<ReleaseCheckFailure> failure) {

    public ReleaseCheck {
        if (latest == null || checkedAt == null || succeededAt == null || failure == null) {
            throw new IllegalArgumentException("A release check names what it does not know as empty");
        }
    }

    public static ReleaseCheck none() {
        return new ReleaseCheck(Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty());
    }

    public ReleaseCheck found(LatestRelease release, Instant at) {
        return new ReleaseCheck(Optional.of(release), Optional.of(at), Optional.of(at), Optional.empty());
    }

    public ReleaseCheck failed(ReleaseCheckFailure reason, Instant at) {
        return new ReleaseCheck(latest, Optional.of(at), succeededAt, Optional.of(reason));
    }

    public ReleaseStatus statusFor(Optional<Release> running) {
        return new ReleaseStatus(running, latest, checkedAt, succeededAt, failure);
    }
}
