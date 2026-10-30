package cz.novanadeje.app.support;

import cz.novanadeje.app.operations.application.clienterrors.ClientErrorCap;
import cz.novanadeje.app.operations.domain.clienterrors.ClientErrorBucket;
import cz.novanadeje.app.operations.domain.clienterrors.ClientErrorKind;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;

class ClientErrorCapWindowsTest {

    @Test
    @DisplayName("Given a full cap at a fixed instant, when its windows are reset, then the next scenario at the same instant starts with an open cap")
    void should_open_the_cap_when_reset_given_a_full_cap_at_a_fixed_instant() {
        ClientErrorCap cap = new ClientErrorCap(new MutableClock(Instant.parse("2026-11-04T09:00:00Z"), ZoneOffset.UTC), new RecordingResetTimer());
        for (int report = 0; report < ClientErrorBucket.GENERAL.perHour(); report++) {
            cap.admits(ClientErrorKind.UNEXPECTED);
        }
        assertThat(cap.admits(ClientErrorKind.UNEXPECTED)).isFalse();

        ClientErrorCapWindows.reset(cap);

        assertThat(cap.admits(ClientErrorKind.UNEXPECTED)).isTrue();
    }
}
