package cz.novanadeje.app.cucumber.transcript;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.TimeZone;

import static org.assertj.core.api.Assertions.assertThat;

class RecordingEnvironmentTest {

    private static final String PINNED_ZONE = "Etc/UTC";

    @Test
    @DisplayName("Given the test JVM, when it runs, then it is pinned to zone Etc/UTC, locale en_US and charset UTF-8, which record the v2 baseline byte for byte")
    void should_run_in_the_pinned_zone_locale_and_charset_when_the_test_jvm_runs() {
        assertThat(TimeZone.getDefault().getID()).isEqualTo(PINNED_ZONE);
        assertThat(Locale.getDefault()).isEqualTo(Locale.US);
        assertThat(Charset.defaultCharset()).isEqualTo(StandardCharsets.UTF_8);
    }
}
