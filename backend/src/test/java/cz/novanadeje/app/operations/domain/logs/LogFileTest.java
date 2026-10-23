package cz.novanadeje.app.operations.domain.logs;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class LogFileTest {

    @Test
    @DisplayName("Given a plain file name, when it is checked, then it is valid and a .gz name counts as compressed")
    void should_accept_plain_names_when_checked_given_safe_characters() {
        assertThat(LogFile.isValidName("backend.log")).isTrue();
        assertThat(LogFile.isValidName("backend.log.2026-10-22.0.gz")).isTrue();
        assertThat(LogFile.isCompressed("backend.log.2026-10-22.0.gz")).isTrue();
        assertThat(LogFile.isCompressed("backend.log")).isFalse();
    }

    @Test
    @DisplayName("Given a name with a path, a leading dot or spaces, when it is checked, then it is refused")
    void should_refuse_names_when_checked_given_path_segments_or_hidden_files() {
        assertThat(LogFile.isValidName("../etc/passwd")).isFalse();
        assertThat(LogFile.isValidName("logs/backend.log")).isFalse();
        assertThat(LogFile.isValidName(".gitkeep")).isFalse();
        assertThat(LogFile.isValidName("backend log")).isFalse();
        assertThat(LogFile.isValidName("")).isFalse();
        assertThat(LogFile.isValidName(null)).isFalse();
        assertThat(LogFile.isValidName("a".repeat(LogFile.MAX_NAME_LENGTH + 1))).isFalse();
    }

    @Test
    @DisplayName("Given an unsafe name, when a log file is built, then it is refused")
    void should_refuse_file_when_built_given_unsafe_name() {
        assertThatThrownBy(() -> new LogFile("../x", 1, Instant.EPOCH, false)).isInstanceOf(IllegalArgumentException.class);
    }
}
