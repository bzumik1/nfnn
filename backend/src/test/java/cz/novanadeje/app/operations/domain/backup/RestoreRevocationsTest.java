package cz.novanadeje.app.operations.domain.backup;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RestoreRevocationsTest {

    @Test
    @DisplayName("Given counts of none or more, when the revocations of a restore are made, then they keep both counts")
    void should_keep_both_counts_when_made_given_counts_of_none_or_more() {
        RestoreRevocations revocations = new RestoreRevocations(0, 3);

        assertThat(revocations.sessions()).isZero();
        assertThat(revocations.oneTimeSecrets()).isEqualTo(3);
    }

    @Test
    @DisplayName("Given a negative count, when the revocations of a restore are made, then they are refused")
    void should_refuse_when_made_given_a_negative_count() {
        assertThatThrownBy(() -> new RestoreRevocations(-1, 0)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new RestoreRevocations(0, -1)).isInstanceOf(IllegalArgumentException.class);
    }
}
