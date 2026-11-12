package cz.novanadeje.app.shared.application.session;

import java.util.UUID;

public interface SignedInDevices {

    void holdSignedIn(UUID donorId, UUID deviceId);
}
