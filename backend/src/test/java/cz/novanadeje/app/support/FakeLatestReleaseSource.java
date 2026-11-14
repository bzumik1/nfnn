package cz.novanadeje.app.support;

import cz.novanadeje.app.operations.application.release.LatestReleaseSource;
import cz.novanadeje.app.operations.application.release.LatestReleaseUnavailable;
import cz.novanadeje.app.operations.domain.release.LatestRelease;

import java.util.concurrent.atomic.AtomicReference;

public class FakeLatestReleaseSource implements LatestReleaseSource {

    private static final int NOT_FOUND = 404;

    private final AtomicReference<LatestRelease> published = new AtomicReference<>();
    private final AtomicReference<LatestReleaseUnavailable> failure = new AtomicReference<>();

    @Override
    public LatestRelease fetch() {
        LatestReleaseUnavailable unavailable = failure.get();
        if (unavailable != null) {
            throw unavailable;
        }
        LatestRelease latest = published.get();
        if (latest == null) {
            throw LatestReleaseUnavailable.status(NOT_FOUND);
        }
        return latest;
    }

    public void publish(LatestRelease latest) {
        published.set(latest);
        failure.set(null);
    }

    public void failWith(LatestReleaseUnavailable unavailable) {
        failure.set(unavailable);
    }

    public void reset() {
        published.set(null);
        failure.set(null);
    }
}
