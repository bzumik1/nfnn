package cz.novanadeje.app.support;

import cz.novanadeje.app.operations.application.release.ReleaseChecks;
import cz.novanadeje.app.operations.domain.release.ReleaseCheck;

import java.util.concurrent.atomic.AtomicReference;
import java.util.function.UnaryOperator;

public class ResettableReleaseChecks implements ReleaseChecks {

    private final AtomicReference<ReleaseCheck> check = new AtomicReference<>(ReleaseCheck.none());

    @Override
    public ReleaseCheck current() {
        return check.get();
    }

    @Override
    public void record(UnaryOperator<ReleaseCheck> change) {
        check.updateAndGet(change);
    }

    public void reset() {
        check.set(ReleaseCheck.none());
    }
}
