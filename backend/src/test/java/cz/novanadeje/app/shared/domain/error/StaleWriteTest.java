package cz.novanadeje.app.shared.domain.error;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class StaleWriteTest {

    private static final String CODE = "content/changed-meanwhile";

    @Test
    @DisplayName("Given the version stored now, when a stale write names it, then it is its version and its only extension")
    void should_answer_the_version_as_its_only_extension_when_named_given_the_stored_version() {
        StaleWrite staleWrite = new ProbeStaleWrite(CODE, "0123456789abcdef");

        assertThat(staleWrite.version()).contains("0123456789abcdef");
        assertThat(staleWrite.extensions()).isEqualTo(Map.of("version", "0123456789abcdef"));
    }

    @Test
    @DisplayName("Given a record removed before its lock, when a stale write is made without a version, then it has no version and no extension")
    void should_have_no_version_and_no_extension_when_made_given_a_record_removed_before_its_lock() {
        StaleWrite staleWrite = ProbeStaleWrite.withoutVersion(CODE);

        assertThat(staleWrite.version()).isEmpty();
        assertThat(staleWrite.extensions()).isEmpty();
    }

    @Test
    @DisplayName("Given no version, when a stale write is made to name one, then it is refused")
    void should_refuse_when_made_given_no_version() {
        assertThatThrownBy(() -> new ProbeStaleWrite(CODE, null)).isInstanceOf(IllegalArgumentException.class);
    }
}
