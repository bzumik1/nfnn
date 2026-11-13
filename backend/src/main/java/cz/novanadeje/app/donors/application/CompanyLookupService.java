package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.CompanyIdentifier;
import cz.novanadeje.app.donors.domain.RegisteredCompany;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.Optional;

@Service
public class CompanyLookupService {

    private static final Logger log = LoggerFactory.getLogger(CompanyLookupService.class);

    private final CompanyRegistry registry;

    public CompanyLookupService(CompanyRegistry registry) {
        this.registry = registry;
    }

    public Optional<RegisteredCompany> lookUp(CompanyIdentifier identifier) {
        try {
            return registry.find(identifier);
        } catch (CompanyRegistryUnavailable unavailable) {
            report(unavailable);
            return Optional.empty();
        }
    }

    private static void report(CompanyRegistryUnavailable unavailable) {
        if (unavailable.failure() == CompanyRegistryFailure.PAUSED) {
            return;
        }
        unavailable.pause().ifPresentOrElse(
                pause -> log.warn("The company register lookup failed: {}; {} failures in a row, so it is skipped for {} minutes",
                        unavailable.outcome(), pause.failuresInARow(), pause.length().toMinutes()),
                () -> log.warn("The company register lookup failed: {}", unavailable.outcome()));
    }
}
