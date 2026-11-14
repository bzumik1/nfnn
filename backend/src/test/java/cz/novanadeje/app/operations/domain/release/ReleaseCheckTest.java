package cz.novanadeje.app.operations.domain.release;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

class ReleaseCheckTest {

    private static final Instant PUBLISHED = Instant.parse("2026-11-14T09:30:00Z");
    private static final Instant MORNING = Instant.parse("2026-11-15T05:45:00Z");
    private static final Instant NEXT_MORNING = Instant.parse("2026-11-16T05:45:00Z");

    @Nested
    @DisplayName("Given no check yet")
    class NoCheck {

        private final ReleaseCheck none = ReleaseCheck.none();

        @Test
        @DisplayName("when the status is read for a running release, then nothing is known and no update is offered")
        void should_offer_nothing_when_read_given_no_check() {
            ReleaseStatus status = none.statusFor(release("2026.11.3"));

            assertThat(status.latest()).isEmpty();
            assertThat(status.checkedAt()).isEmpty();
            assertThat(status.updateAvailable()).isFalse();
        }

        @Test
        @DisplayName("when the source names the latest release, then it is kept with the time of the check")
        void should_keep_latest_when_found_given_no_check() {
            ReleaseCheck found = none.found(latest("2026.11.5"), MORNING);

            assertThat(found.latest()).contains(latest("2026.11.5"));
            assertThat(found.checkedAt()).contains(MORNING);
            assertThat(found.succeededAt()).contains(MORNING);
            assertThat(found.failure()).isEmpty();
        }
    }

    @Nested
    @DisplayName("Given a latest release known from a morning check")
    class Known {

        private final ReleaseCheck known = ReleaseCheck.none().found(latest("2026.11.5"), MORNING);

        @Test
        @DisplayName("when an older release runs, then an update is offered")
        void should_offer_update_when_read_given_older_running() {
            assertThat(known.statusFor(release("2026.11.3")).updateAvailable()).isTrue();
        }

        @Test
        @DisplayName("when that release runs, then no update is offered")
        void should_offer_no_update_when_read_given_same_running() {
            assertThat(known.statusFor(release("2026.11.5")).updateAvailable()).isFalse();
        }

        @Test
        @DisplayName("when a newer release runs after the check, then no update is offered")
        void should_offer_no_update_when_read_given_newer_running() {
            assertThat(known.statusFor(release("2026.11.6")).updateAvailable()).isFalse();
        }

        @Test
        @DisplayName("when a build outside the releases runs, then no update is offered")
        void should_offer_no_update_when_read_given_dev_build() {
            ReleaseStatus status = known.statusFor(Optional.empty());

            assertThat(status.running()).isEmpty();
            assertThat(status.updateAvailable()).isFalse();
        }

        @Test
        @DisplayName("when the next check fails, then the latest release and its success stay and the failure is named")
        void should_keep_latest_when_failed_given_known() {
            ReleaseCheck failed = known.failed(ReleaseCheckFailure.UNREACHABLE, NEXT_MORNING);

            assertThat(failed.latest()).contains(latest("2026.11.5"));
            assertThat(failed.succeededAt()).contains(MORNING);
            assertThat(failed.checkedAt()).contains(NEXT_MORNING);
            assertThat(failed.failure()).contains(ReleaseCheckFailure.UNREACHABLE);
            assertThat(failed.statusFor(release("2026.11.3")).updateAvailable()).isTrue();
        }

    }

    private static Optional<Release> release(String text) {
        return Release.parse(text);
    }

    private static LatestRelease latest(String text) {
        return new LatestRelease(Release.parse(text).orElseThrow(), PUBLISHED);
    }
}
