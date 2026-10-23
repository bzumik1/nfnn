package cz.novanadeje.app.operations.domain.loggers;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class LoggerNameTest {

    @Test
    @DisplayName("Given ROOT or a dotted Java name, when it is checked, then it is valid")
    void should_accept_name_when_checked_given_root_or_dotted_name() {
        assertThat(LoggerName.isValid("ROOT")).isTrue();
        assertThat(LoggerName.isValid("cz.novanadeje.app")).isTrue();
        assertThat(LoggerName.isValid("org.hibernate.SQL")).isTrue();
        assertThat(LoggerName.isValid("io.github.bzumik1.fio.FioClient$Inner")).isTrue();
    }

    @Test
    @DisplayName("Given spaces, slashes, a leading dot or an overlong name, when it is checked, then it is refused")
    void should_refuse_name_when_checked_given_odd_characters() {
        assertThat(LoggerName.isValid("not a logger!")).isFalse();
        assertThat(LoggerName.isValid("cz/novanadeje")).isFalse();
        assertThat(LoggerName.isValid(".cz")).isFalse();
        assertThat(LoggerName.isValid("")).isFalse();
        assertThat(LoggerName.isValid(null)).isFalse();
        assertThat(LoggerName.isValid("a".repeat(LoggerName.MAX_LENGTH + 1))).isFalse();
        assertThatThrownBy(() -> new LoggerName("x y")).isInstanceOf(IllegalArgumentException.class);
    }
}
