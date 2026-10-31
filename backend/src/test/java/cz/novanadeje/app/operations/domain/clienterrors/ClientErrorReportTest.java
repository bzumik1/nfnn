package cz.novanadeje.app.operations.domain.clienterrors;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ClientErrorReportTest {

    @ParameterizedTest
    @ValueSource(strings = {"dev", "1a2b3c4", "0123456789abcdef0123456789abcdef01234567"})
    @DisplayName("Given a short or full lowercase commit id or dev, when an app version is made, then it is kept")
    void should_keep_version_when_made_given_commit_id_or_dev(String value) {
        assertThat(new ClientAppVersion(value).value()).isEqualTo(value);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "1a2b3c", "1A2B3C4", "0123456789abcdef0123456789abcdef012345678", "2099-778177", "dev\n", "DEV", "g123456"})
    @DisplayName("Given anything but a lowercase commit id of 7 to 40 characters or dev, when an app version is made, then it is refused")
    void should_refuse_version_when_made_given_other_text(String value) {
        assertThat(ClientAppVersion.isValid(value)).isFalse();
        assertThatThrownBy(() -> new ClientAppVersion(value)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given no text, when an app version is checked, then it is refused")
    void should_refuse_version_when_checked_given_no_text() {
        assertThat(ClientAppVersion.isValid(null)).isFalse();
    }

    @Test
    @DisplayName("Given the bounds of the count and the browser major, when a report is made, then both ends are kept")
    void should_keep_bounds_when_made_given_count_and_major_at_their_ends() {
        assertThat(report(Optional.of(1), 1).count()).isEqualTo(1);
        assertThat(report(Optional.of(ClientErrorReport.MAX_BROWSER_MAJOR), ClientErrorReport.MAX_COUNT).browserMajor())
                .contains(ClientErrorReport.MAX_BROWSER_MAJOR);
        assertThat(report(Optional.empty(), 1).browserMajor()).isEmpty();
    }

    @Test
    @DisplayName("Given a count or a browser major outside its range, when a report is made, then it is refused")
    void should_refuse_report_when_made_given_values_out_of_range() {
        assertThatThrownBy(() -> report(Optional.of(1), 0)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> report(Optional.of(1), ClientErrorReport.MAX_COUNT + 1)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> report(Optional.of(0), 1)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> report(Optional.of(ClientErrorReport.MAX_BROWSER_MAJOR + 1), 1)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given a missing term, when a report is made, then it is refused")
    void should_refuse_report_when_made_given_missing_term() {
        assertThatThrownBy(() -> new ClientErrorReport(null, ClientErrorPlace.GLOBAL, ClientErrorName.ERROR, new ClientAppVersion("dev"),
                ClientBrowser.CHROME, Optional.of(131), ClientOperatingSystem.ANDROID, ClientDisplayMode.BROWSER, 1))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given a protected kind, when its bucket is asked for, then it has a bucket of its own and every other kind shares the general one")
    void should_give_protected_kinds_their_own_bucket_when_asked_given_kinds() {
        assertThat(ClientErrorBucket.of(ClientErrorKind.PDF_RENDER)).isEqualTo(ClientErrorBucket.PDF_RENDER);
        assertThat(ClientErrorBucket.of(ClientErrorKind.PDF_LOAD)).isEqualTo(ClientErrorBucket.PDF_LOAD);
        assertThat(ClientErrorBucket.of(ClientErrorKind.VERIFY_SIGNATURE)).isEqualTo(ClientErrorBucket.VERIFY_SIGNATURE);
        assertThat(ClientErrorBucket.of(ClientErrorKind.UNEXPECTED)).isEqualTo(ClientErrorBucket.GENERAL);
        assertThat(ClientErrorBucket.of(ClientErrorKind.CHUNK_LOAD)).isEqualTo(ClientErrorBucket.GENERAL);
        assertThat(ClientErrorBucket.of(ClientErrorKind.QR_ENCODE)).isEqualTo(ClientErrorBucket.GENERAL);
        assertThat(ClientErrorBucket.of(ClientErrorKind.VERIFY_PARSE)).isEqualTo(ClientErrorBucket.GENERAL);
    }

    private static ClientErrorReport report(Optional<Integer> major, int count) {
        return new ClientErrorReport(ClientErrorKind.UNEXPECTED, ClientErrorPlace.GLOBAL, ClientErrorName.ERROR, new ClientAppVersion("dev"),
                ClientBrowser.CHROME, major, ClientOperatingSystem.ANDROID, ClientDisplayMode.BROWSER, count);
    }
}
