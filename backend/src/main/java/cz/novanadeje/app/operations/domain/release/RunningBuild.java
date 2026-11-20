package cz.novanadeje.app.operations.domain.release;

import java.util.Optional;

public record RunningBuild(Revision revision, Optional<Release> release) {

    public RunningBuild {
        if (revision == null || release == null) {
            throw new IllegalArgumentException("A running build names its revision and its release, empty for an image without a release number");
        }
    }
}
