package cz.novanadeje.app.donors.application;

import java.time.Duration;

public record CompanyRegistryPause(int failuresInARow, Duration length) {

    public CompanyRegistryPause {
        if (failuresInARow < 1) {
            throw new IllegalArgumentException("failuresInARow must be positive");
        }
        if (length == null || length.isNegative() || length.isZero()) {
            throw new IllegalArgumentException("length must be positive");
        }
    }
}
