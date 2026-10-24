package cz.novanadeje.app.content.application.media;

import java.time.Instant;

public record MediaCleanup(Instant uploadedBefore, int deleted) {
}
