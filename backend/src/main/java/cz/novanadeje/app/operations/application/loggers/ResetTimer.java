package cz.novanadeje.app.operations.application.loggers;

import java.time.Instant;

public interface ResetTimer {

    void at(Instant when, Runnable task);
}
