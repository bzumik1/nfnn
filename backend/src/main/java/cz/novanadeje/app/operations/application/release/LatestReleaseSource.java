package cz.novanadeje.app.operations.application.release;

import cz.novanadeje.app.operations.domain.release.LatestRelease;

public interface LatestReleaseSource {

    LatestRelease fetch();
}
