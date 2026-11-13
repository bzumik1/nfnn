package cz.novanadeje.app.operations.application.push;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public record DonorPushView(String publicKey, boolean deviceSession, Optional<DonorPushDeviceView> device, List<UUID> devices) {
}
