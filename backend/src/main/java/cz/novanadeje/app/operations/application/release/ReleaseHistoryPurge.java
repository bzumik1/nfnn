package cz.novanadeje.app.operations.application.release;

import java.time.Instant;

public record ReleaseHistoryPurge(Instant endedBefore, int deleted) {
}
