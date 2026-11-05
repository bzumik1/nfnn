package cz.novanadeje.app.operations.application.push;

import java.time.Instant;

public interface PushRetryTimer {

    void at(Instant when, Runnable task);
}
