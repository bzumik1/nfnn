package cz.novanadeje.app.operations.application.release;

import cz.novanadeje.app.operations.domain.release.LatestRelease;
import cz.novanadeje.app.operations.domain.release.Release;
import cz.novanadeje.app.operations.domain.release.ReleaseCheckFailure;
import cz.novanadeje.app.operations.domain.release.ReleaseStatus;
import cz.novanadeje.app.support.ResettableReleaseChecks;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ReleaseCheckServiceTest {

    private static final Instant NOW = Instant.parse("2026-11-30T23:30:00Z");
    private static final Instant PUBLISHED = Instant.parse("2026-11-14T09:30:00Z");

    private final LatestReleaseSource source = mock(LatestReleaseSource.class);
    private final ReleaseCheckService service = new ReleaseCheckService(source, new ResettableReleaseChecks(), Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    @DisplayName("Given the source names a newer release, when the check runs, then the status offers the update")
    void should_offer_update_when_checked_given_newer_release() {
        when(source.fetch()).thenReturn(latest("2026.11.5", PUBLISHED));

        ReleaseCheckOutcome outcome = service.check();

        assertThat(outcome).isEqualTo(new ReleaseCheckOutcome.Found(release("2026.11.5")));
        ReleaseStatus status = service.status(Optional.of(release("2026.11.3")));
        assertThat(status.latest()).contains(latest("2026.11.5", PUBLISHED));
        assertThat(status.checkedAt()).contains(NOW);
        assertThat(status.updateAvailable()).isTrue();
    }

    @Test
    @DisplayName("Given a release of the Prague month that began in UTC's last hour, when the check runs, then it is accepted")
    void should_accept_release_when_checked_given_prague_month_ahead_of_utc() {
        when(source.fetch()).thenReturn(latest("2026.12.1", NOW));

        assertThat(service.check()).isEqualTo(new ReleaseCheckOutcome.Found(release("2026.12.1")));
    }

    @Test
    @DisplayName("Given a release of a later month than Prague's, when the check runs, then it is refused and the known one stays")
    void should_refuse_release_when_checked_given_future_month() {
        when(source.fetch()).thenReturn(latest("2026.11.5", PUBLISHED));
        service.check();
        when(source.fetch()).thenReturn(latest("9999.1.1", PUBLISHED));

        ReleaseCheckOutcome outcome = service.check();

        assertThat(outcome).isEqualTo(new ReleaseCheckOutcome.Failed(ReleaseCheckFailure.REFUSED_ANSWER, "refused answer"));
        ReleaseStatus status = service.status(Optional.of(release("2026.11.3")));
        assertThat(status.latest()).contains(latest("2026.11.5", PUBLISHED));
        assertThat(status.failure()).contains(ReleaseCheckFailure.REFUSED_ANSWER);
    }

    @Test
    @DisplayName("Given a release published more than a day ahead of the server's clock, when the check runs, then it is refused")
    void should_refuse_release_when_checked_given_publication_ahead() {
        when(source.fetch()).thenReturn(latest("2026.11.5", NOW.plusSeconds(2 * 24 * 3600)));

        assertThat(service.check()).isInstanceOf(ReleaseCheckOutcome.Failed.class);
        assertThat(service.status(Optional.empty()).latest()).isEmpty();
    }

    @Test
    @DisplayName("Given the source is unreachable, when the check runs, then the failure is kept with its time")
    void should_keep_failure_when_checked_given_unreachable_source() {
        when(source.fetch()).thenThrow(LatestReleaseUnavailable.status(403));

        ReleaseCheckOutcome outcome = service.check();

        assertThat(outcome).isEqualTo(new ReleaseCheckOutcome.Failed(ReleaseCheckFailure.STATUS, "status 403"));
        ReleaseStatus status = service.status(Optional.empty());
        assertThat(status.failure()).contains(ReleaseCheckFailure.STATUS);
        assertThat(status.checkedAt()).contains(NOW);
        assertThat(status.succeededAt()).isEmpty();
    }


    @Test
    @DisplayName("Given no check ran yet, when the status is read, then nothing is known")
    void should_know_nothing_when_read_given_no_check() {
        ReleaseStatus status = service.status(Optional.of(release("2026.11.3")));

        assertThat(status.latest()).isEmpty();
        assertThat(status.checkedAt()).isEmpty();
        assertThat(status.updateAvailable()).isFalse();
    }

    private static Release release(String text) {
        return Release.parse(text).orElseThrow();
    }

    private static LatestRelease latest(String text, Instant publishedAt) {
        return new LatestRelease(release(text), publishedAt);
    }
}
