package cz.novanadeje.app.shared.application.session;

import java.util.UUID;

public interface SignedInDevices {

    SignedInDevice holdSignedIn(UUID donorId, UUID deviceId);
}
