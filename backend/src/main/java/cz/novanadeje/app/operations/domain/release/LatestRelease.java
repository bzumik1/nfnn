package cz.novanadeje.app.operations.domain.release;

import java.time.Instant;

public record LatestRelease(Release release, Instant publishedAt) {

    public LatestRelease {
        if (release == null || publishedAt == null) {
            throw new IllegalArgumentException("The latest release names its number and when it was published");
        }
    }
}
