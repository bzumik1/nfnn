package cz.novanadeje.app.donors.infrastructure.ares;

import cz.novanadeje.app.donors.application.CompanyRegistry;
import cz.novanadeje.app.donors.application.CompanyRegistryFailure;
import cz.novanadeje.app.donors.application.CompanyRegistryPause;
import cz.novanadeje.app.donors.application.CompanyRegistryUnavailable;
import cz.novanadeje.app.donors.domain.CompanyIdentifier;
import cz.novanadeje.app.donors.domain.RegisteredCompany;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

public class CompanyRegistryBreaker implements CompanyRegistry {

    static final int FAILURES_BEFORE_PAUSE = 3;
    static final Duration PAUSE = Duration.ofMinutes(5);

    private final CompanyRegistry registry;
    private final Clock clock;
    private int failuresInARow;
    private Instant lastFailure = Instant.MIN;
    private Instant pausedUntil = Instant.MIN;

    public CompanyRegistryBreaker(CompanyRegistry registry, Clock clock) {
        this.registry = registry;
        this.clock = clock;
    }

    @Override
    public Optional<RegisteredCompany> find(CompanyIdentifier identifier) {
        if (paused()) {
            throw new CompanyRegistryUnavailable(CompanyRegistryFailure.PAUSED);
        }
        try {
            Optional<RegisteredCompany> company = registry.find(identifier);
            recordAnswer();
            return company;
        } catch (CompanyRegistryUnavailable unavailable) {
            throw recordFailure(unavailable);
        } catch (RuntimeException unexpected) {
            throw recordFailure(CompanyRegistryUnavailable.unexpected(unexpected));
        }
    }

    CompanyRegistry registry() {
        return registry;
    }

    private synchronized boolean paused() {
        return clock.instant().isBefore(pausedUntil);
    }

    private synchronized void recordAnswer() {
        failuresInARow = 0;
    }

    private synchronized CompanyRegistryUnavailable recordFailure(CompanyRegistryUnavailable unavailable) {
        Instant now = clock.instant();
        if (lastFailure.plus(PAUSE).isBefore(now)) {
            failuresInARow = 0;
        }
        failuresInARow++;
        lastFailure = now;
        if (failuresInARow < FAILURES_BEFORE_PAUSE) {
            return unavailable;
        }
        pausedUntil = now.plus(PAUSE);
        return unavailable.pausing(new CompanyRegistryPause(failuresInARow, PAUSE));
    }
}
