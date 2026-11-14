package cz.novanadeje.app.operations.application.release;

import cz.novanadeje.app.operations.domain.release.ReleaseCheck;

import java.util.function.UnaryOperator;

public interface ReleaseChecks {

    ReleaseCheck current();

    void record(UnaryOperator<ReleaseCheck> change);
}
