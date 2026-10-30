package cz.novanadeje.app.shared.application.restore;

import java.util.Optional;

public interface FinishedRestores {

    Optional<FinishedRestore> lastSucceeded();
}
