package cz.novanadeje.app.operations.application.settings;

import cz.novanadeje.app.operations.domain.settings.SetupCode;

public interface SetupCodeAnnouncer {

    void announce(SetupCode code);
}
