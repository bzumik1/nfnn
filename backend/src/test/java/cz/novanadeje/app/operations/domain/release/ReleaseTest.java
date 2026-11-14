package cz.novanadeje.app.operations.domain.release;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.time.YearMonth;

import static org.assertj.core.api.Assertions.assertThat;

class ReleaseTest {

    @Test
    @DisplayName("Given a release of the scheme, when it is parsed, then it keeps its year, month and order and prints as it came")
    void should_keep_parts_when_parsed_given_scheme() {
        assertThat(Release.parse("2026.11.12")).hasValueSatisfying(release -> {
            assertThat(release.month()).isEqualTo(YearMonth.of(2026, 11));
            assertThat(release.order()).isEqualTo(12);
            assertThat(release).hasToString("2026.11.12");
        });
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "dev", "latest", "2026.13.1", "2026.01.1", "2026.11.0", "2026.11.12345", "v2026.11.3", "2026.11.3-rc", "2025.12.1",
            "2026.11.3 ", "20260.11.3", "a1b2c3d"})
    @DisplayName("Given a text outside the scheme or before the first release, when it is parsed, then there is no release")
    void should_have_no_release_when_parsed_given_outside_scheme(String text) {
        assertThat(Release.parse(text)).isEmpty();
    }

    @Test
    @DisplayName("Given a text far longer than a release, when it is parsed, then there is no release")
    void should_have_no_release_when_parsed_given_long_text() {
        assertThat(Release.parse("2026.11.3".repeat(1000))).isEmpty();
    }

    @Test
    @DisplayName("Given two releases of one month, when they are compared, then the order counts as a number, not as text")
    void should_compare_order_as_number_when_compared_given_one_month() {
        assertThat(release("2026.11.10").isNewerThan(release("2026.11.9"))).isTrue();
        assertThat(release("2026.11.9").isNewerThan(release("2026.11.10"))).isFalse();
    }

    @Test
    @DisplayName("Given releases of different months, when they are compared, then the later month is newer whatever the order")
    void should_compare_month_first_when_compared_given_months() {
        assertThat(release("2027.1.1").isNewerThan(release("2026.12.40"))).isTrue();
        assertThat(release("2026.12.1").isNewerThan(release("2026.2.9"))).isTrue();
    }

    @Test
    @DisplayName("Given the same release, when it is compared with itself, then it is not newer")
    void should_not_be_newer_when_compared_given_same_release() {
        assertThat(release("2026.11.3").isNewerThan(release("2026.11.3"))).isFalse();
    }

    private static Release release(String text) {
        return Release.parse(text).orElseThrow();
    }
}
