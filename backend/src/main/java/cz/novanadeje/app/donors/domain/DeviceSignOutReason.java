package cz.novanadeje.app.donors.domain;

import java.util.Optional;

public enum DeviceSignOutReason {
    SIGNED_OUT, REMOTE_SIGN_OUT, CREDENTIALS_CHANGED, ADMINISTRATION_CHANGED, ERASED, REPLAY, EXPIRED;

    public Optional<DeviceWipe> wipe() {
        return switch (this) {
            case REMOTE_SIGN_OUT, ERASED -> Optional.of(DeviceWipe.ALL);
            case SIGNED_OUT, CREDENTIALS_CHANGED, ADMINISTRATION_CHANGED, REPLAY, EXPIRED -> Optional.empty();
        };
    }
}
