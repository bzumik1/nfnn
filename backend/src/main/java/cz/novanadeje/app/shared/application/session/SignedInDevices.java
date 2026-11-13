package cz.novanadeje.app.shared.application.session;

import java.util.Collection;
import java.util.Set;
import java.util.UUID;

public interface SignedInDevices {

    SignedInDevice holdSignedIn(UUID donorId, UUID deviceId);

    Set<UUID> signedInAmong(Collection<UUID> deviceIds);
}
