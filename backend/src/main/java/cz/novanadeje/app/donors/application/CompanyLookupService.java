package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.CompanyIdentifier;
import cz.novanadeje.app.donors.domain.RegisteredCompany;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

@Service
public class CompanyLookupService {

    static final int FAILURES_BEFORE_PAUSE = 3;
    static final Duration PAUSE = Duration.ofMinutes(5);

    private static final Logger log = LoggerFactory.getLogger(CompanyLookupService.class);

    private final CompanyRegistry registry;
    private final Clock clock;
    private int failuresInARow;
    private Instant lastFailure = Instant.MIN;
    private Instant pausedUntil = Instant.MIN;

    public CompanyLookupService(CompanyRegistry registry, Clock clock) {
        this.registry = registry;
        this.clock = clock;
    }

    public Optional<RegisteredCompany> lookUp(CompanyIdentifier identifier) {
        if (paused()) {
            return Optional.empty();
        }
        try {
            Optional<RegisteredCompany> company = registry.find(identifier);
            recordAnswer();
            return company;
        } catch (CompanyRegistryUnavailable unavailable) {
            recordFailure(unavailable.getMessage());
        } catch (RuntimeException unexpected) {
            recordFailure(unexpected.getClass().getSimpleName());
        }
        return Optional.empty();
    }

    private synchronized boolean paused() {
        return clock.instant().isBefore(pausedUntil);
    }

    private synchronized void recordAnswer() {
        failuresInARow = 0;
    }

    private synchronized void recordFailure(String outcome) {
        Instant now = clock.instant();
        if (lastFailure.plus(PAUSE).isBefore(now)) {
            failuresInARow = 0;
        }
        failuresInARow++;
        lastFailure = now;
        if (failuresInARow >= FAILURES_BEFORE_PAUSE) {
            pausedUntil = now.plus(PAUSE);
            log.warn("The company register lookup failed: {}; {} failures in a row, so it is skipped for {} minutes",
                    outcome, failuresInARow, PAUSE.toMinutes());
            return;
        }
        log.warn("The company register lookup failed: {}", outcome);
    }
}
