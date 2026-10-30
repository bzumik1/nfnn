package cz.novanadeje.app.support;

import cz.novanadeje.app.donors.application.CompanyLookupService;
import cz.novanadeje.app.donors.application.CompanyRegistry;
import cz.novanadeje.app.donors.application.CompanyRegistryUnavailable;
import cz.novanadeje.app.donors.domain.CompanyIdentifier;
import cz.novanadeje.app.donors.domain.RegisteredCompany;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

class CompanyLookupPauseTest {

    private static final CompanyIdentifier COMPANY = new CompanyIdentifier("45274649");

    @Test
    @DisplayName("Given a lookup paused after three failures under a fixed clock, when the pause is reset, then the next lookup asks the register again")
    void should_ask_the_register_again_when_the_pause_is_reset_given_a_lookup_paused_after_three_failures() {
        AtomicBoolean down = new AtomicBoolean(true);
        AtomicInteger asked = new AtomicInteger();
        CompanyRegistry registry = identifier -> {
            asked.incrementAndGet();
            if (down.get()) {
                throw new CompanyRegistryUnavailable("down");
            }
            return Optional.of(new RegisteredCompany(identifier, "Stavby Novák s.r.o.", Optional.empty()));
        };
        CompanyLookupService lookup = new CompanyLookupService(registry, Clock.fixed(Instant.parse("2026-11-04T09:00:00Z"), ZoneOffset.UTC));
        for (int attempt = 0; attempt < 3; attempt++) {
            lookup.lookUp(COMPANY);
        }
        down.set(false);
        assertThat(lookup.lookUp(COMPANY)).isEmpty();
        assertThat(asked).hasValue(3);

        CompanyLookupPause.reset(lookup);

        assertThat(lookup.lookUp(COMPANY)).isPresent();
        assertThat(asked).hasValue(4);
    }
}
