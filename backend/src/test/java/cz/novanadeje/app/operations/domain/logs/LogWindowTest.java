package cz.novanadeje.app.operations.domain.logs;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class LogWindowTest {

    @Test
    @DisplayName("Given a window in the middle of a file, when it is asked, then it has older and newer bytes")
    void should_report_older_and_newer_when_asked_given_window_in_the_middle() {
        LogWindow window = new LogWindow("backend.log", 100, 10, 50, "text");
        assertThat(window.hasOlder()).isTrue();
        assertThat(window.hasNewer()).isTrue();
    }

    @Test
    @DisplayName("Given a window covering the whole file, when it is asked, then nothing is older or newer")
    void should_report_nothing_around_when_asked_given_whole_file() {
        LogWindow window = new LogWindow("backend.log", 100, 0, 100, "text");
        assertThat(window.hasOlder()).isFalse();
        assertThat(window.hasNewer()).isFalse();
    }

    @Test
    @DisplayName("Given bounds outside the file, when a window is built, then it is refused")
    void should_refuse_window_when_built_given_bounds_outside_file() {
        assertThatThrownBy(() -> new LogWindow("backend.log", 100, 50, 120, "")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new LogWindow("backend.log", 100, 60, 50, "")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given requested sizes, when the limits clamp them, then defaults and maxima apply")
    void should_clamp_sizes_when_limited_given_requests() {
        assertThat(LogReadLimits.windowBytes(null)).isEqualTo(LogReadLimits.DEFAULT_WINDOW_BYTES);
        assertThat(LogReadLimits.windowBytes(5_000_000)).isEqualTo(LogReadLimits.MAX_WINDOW_BYTES);
        assertThat(LogReadLimits.windowBytes(0)).isEqualTo(1);
        assertThat(LogReadLimits.matches(null)).isEqualTo(LogReadLimits.DEFAULT_MATCHES);
        assertThat(LogReadLimits.matches(999)).isEqualTo(LogReadLimits.MAX_MATCHES);
    }
}
