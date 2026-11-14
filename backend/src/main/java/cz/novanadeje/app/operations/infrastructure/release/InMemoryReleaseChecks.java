package cz.novanadeje.app.operations.infrastructure.release;

import cz.novanadeje.app.operations.application.release.ReleaseChecks;
import cz.novanadeje.app.operations.domain.release.ReleaseCheck;
import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicReference;
import java.util.function.UnaryOperator;

@Component
class InMemoryReleaseChecks implements ReleaseChecks {

    private final AtomicReference<ReleaseCheck> check = new AtomicReference<>(ReleaseCheck.none());

    @Override
    public ReleaseCheck current() {
        return check.get();
    }

    @Override
    public void record(UnaryOperator<ReleaseCheck> change) {
        check.updateAndGet(change);
    }
}
