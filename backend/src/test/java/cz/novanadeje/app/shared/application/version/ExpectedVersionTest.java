package cz.novanadeje.app.shared.application.version;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ExpectedVersionTest {

    @Test
    @DisplayName("Given no expected version, when any current version is checked, then it is admitted")
    void should_admit_any_version_when_checked_given_none() {
        assertThat(ExpectedVersion.none().admits("0123456789abcdef")).isTrue();
    }

    @Test
    @DisplayName("Given an expected version, when the current version is checked, then only exactly that version is admitted")
    void should_admit_only_the_same_version_when_checked_given_a_version() {
        ExpectedVersion expected = ExpectedVersion.of("0123456789abcdef");

        assertThat(expected.admits("0123456789abcdef")).isTrue();
        assertThat(expected.admits("0123456789ABCDEF")).isFalse();
        assertThat(expected.admits("0123456789abcde0")).isFalse();
    }

    @Test
    @DisplayName("Given the unmatchable version, when any current version is checked, then none is admitted")
    void should_admit_nothing_when_checked_given_the_unmatchable_version() {
        assertThat(ExpectedVersion.of(ExpectedVersion.UNMATCHABLE).admits("0123456789abcdef")).isFalse();
    }

    @Test
    @DisplayName("Given a blank, an over-long or a missing value, when an expected version is made, then it is refused")
    void should_refuse_when_made_given_a_blank_or_long_value() {
        assertThatThrownBy(() -> ExpectedVersion.of(" ")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> ExpectedVersion.of("a".repeat(ExpectedVersion.MAX_LENGTH + 1))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new ExpectedVersion(null)).isInstanceOf(IllegalArgumentException.class);
        assertThat(ExpectedVersion.of("a".repeat(ExpectedVersion.MAX_LENGTH)).value()).isEqualTo(Optional.of("a".repeat(ExpectedVersion.MAX_LENGTH)));
    }
}
