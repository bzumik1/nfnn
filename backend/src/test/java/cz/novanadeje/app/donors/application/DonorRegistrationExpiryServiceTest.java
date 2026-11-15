package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.DonorRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DonorRegistrationExpiryServiceTest {

    private static final Instant NOW = Instant.parse("2026-11-06T09:20:00Z");

    @Mock
    private DonorRepository donors;

    @Test
    @DisplayName("Given two unconfirmed registrations older than thirty days, when the expiry runs, then it deletes the unconfirmed ones registered more than thirty days ago and counts them")
    void should_delete_registrations_older_than_thirty_days_when_run_given_old_unconfirmed_registrations() {
        when(donors.deleteUnconfirmedRegisteredBefore(Instant.parse("2026-10-07T09:20:00Z"))).thenReturn(2);

        ExpiredRegistrations expired = new DonorRegistrationExpiryService(donors, Clock.fixed(NOW, ZoneOffset.UTC)).expireUnconfirmed();

        assertThat(expired).isEqualTo(new ExpiredRegistrations(2, Duration.ofDays(30)));
    }
}
