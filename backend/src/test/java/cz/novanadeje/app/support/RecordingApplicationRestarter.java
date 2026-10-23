package cz.novanadeje.app.support;

import cz.novanadeje.app.operations.application.settings.ApplicationRestarter;

import java.util.concurrent.atomic.AtomicInteger;

public class RecordingApplicationRestarter implements ApplicationRestarter {

    private final AtomicInteger restarts = new AtomicInteger();

    @Override
    public void restartAfterCommit() {
        restarts.incrementAndGet();
    }

    public int restarts() {
        return restarts.get();
    }

    public void reset() {
        restarts.set(0);
    }
}
