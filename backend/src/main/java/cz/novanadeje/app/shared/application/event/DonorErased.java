package cz.novanadeje.app.shared.application.event;

import java.time.Instant;
import java.util.UUID;

public record DonorErased(UUID donorId, Instant erasedAt) {
}
