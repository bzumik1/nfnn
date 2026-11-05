package cz.novanadeje.app.shared.application.session;

import java.util.UUID;

public interface SessionLiveness {

    boolean isLive(UUID sessionId);
}
