package cz.novanadeje.app.donors.infrastructure.ares;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;

class CompanyRegistryConfigurationTest {

    @Test
    @DisplayName("Given the production wiring, when the company register is built, then ARES is asked only through the breaker")
    void should_wrap_ares_in_the_breaker_when_built_given_production_wiring() {
        Clock clock = Clock.fixed(Instant.parse("2026-11-13T09:00:00Z"), ZoneOffset.UTC);

        assertThat(new CompanyRegistryConfiguration().companyRegistry(clock).registry()).isInstanceOf(AresCompanyRegistry.class);
    }
}
