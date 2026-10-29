package cz.novanadeje.app.cucumber.transcript;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.TimeZone;

import static org.assertj.core.api.Assertions.assertThat;

class RecordingEnvironmentTest {

    private static final String RECORDING_ZONE = "Etc/UTC";

    @Test
    @DisplayName("Given the test JVM, when it runs, then its zone, locale and charset are the ones the v2 baseline was recorded with")
    void should_run_in_the_recording_zone_locale_and_charset_when_the_test_jvm_runs() {
        assertThat(TimeZone.getDefault().getID()).isEqualTo(RECORDING_ZONE);
        assertThat(Locale.getDefault()).isEqualTo(Locale.US);
        assertThat(Charset.defaultCharset()).isEqualTo(StandardCharsets.UTF_8);
    }
}
