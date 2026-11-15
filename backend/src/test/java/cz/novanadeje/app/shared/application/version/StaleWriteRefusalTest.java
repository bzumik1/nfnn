package cz.novanadeje.app.shared.application.version;

import cz.novanadeje.app.shared.domain.error.ProbeStaleWrite;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class StaleWriteRefusalTest {

    private static final String CODE = "content/changed-meanwhile";

    private record StoredRow(String name) implements StoredRecord {
    }

    @Test
    @DisplayName("Given a stale write naming the stored version, when it is refused with the stored record, then the refusal carries both and has the stale write as its cause")
    void should_carry_the_stale_write_and_record_when_refused_given_a_stored_version() {
        ProbeStaleWrite staleWrite = new ProbeStaleWrite(CODE, "0123456789abcdef");

        StaleWriteRefusal refusal = new StaleWriteRefusal(staleWrite, new StoredRow("Jana"));

        assertThat(refusal.staleWrite()).isSameAs(staleWrite);
        assertThat(refusal.current()).isEqualTo(new StoredRow("Jana"));
        assertThat(refusal).hasCause(staleWrite);
    }

    @Test
    @DisplayName("Given a stale write without a stored version, when it is refused with a record, then the refusal itself is refused")
    void should_refuse_the_refusal_when_refused_given_no_stored_version() {
        assertThatThrownBy(() -> new StaleWriteRefusal(ProbeStaleWrite.withoutVersion(CODE), new StoredRow("Jana")))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Given a stale write naming the stored version, when it is refused without a record, then the refusal itself is refused")
    void should_refuse_the_refusal_when_refused_given_no_record() {
        assertThatThrownBy(() -> new StaleWriteRefusal(new ProbeStaleWrite(CODE, "0123456789abcdef"), null))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
