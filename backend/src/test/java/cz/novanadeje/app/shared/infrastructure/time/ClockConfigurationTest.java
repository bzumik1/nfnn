package cz.novanadeje.app.shared.infrastructure.time;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;

class ClockConfigurationTest {

    @Test
    @DisplayName("Given the server's clock, when it tells the time, then it has no digits beyond the microseconds PostgreSQL stores, so a version computed before a save equals one computed after a read")
    void should_tell_whole_microseconds_when_asked_given_the_server_clock() {
        Clock clock = new ClockConfiguration().clock();

        IntStream.range(0, 1_000).mapToObj(index -> clock.instant())
                .forEach(instant -> assertThat(instant.truncatedTo(ChronoUnit.MICROS)).isEqualTo(instant));
    }
}
