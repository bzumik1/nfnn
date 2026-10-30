package cz.novanadeje.app.support;

import cz.novanadeje.app.operations.application.settings.SetupCodeAnnouncer;
import cz.novanadeje.app.operations.domain.settings.SetupCode;

import java.util.Optional;

public class RecordingSetupCodeAnnouncer implements SetupCodeAnnouncer {

    private volatile SetupCode announced;

    @Override
    public void announce(SetupCode code) {
        announced = code;
    }

    public Optional<SetupCode> findAnnounced() {
        return Optional.ofNullable(announced);
    }

    public SetupCode announced() {
        return Optional.ofNullable(announced).orElseThrow(() -> new IllegalStateException("No setup code was announced"));
    }
}
