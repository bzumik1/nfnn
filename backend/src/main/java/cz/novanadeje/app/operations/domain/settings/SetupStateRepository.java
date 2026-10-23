package cz.novanadeje.app.operations.domain.settings;

import java.time.Instant;

public interface SetupStateRepository {

    boolean isCompleted();

    void markCompleted(Instant completedAt);
}
