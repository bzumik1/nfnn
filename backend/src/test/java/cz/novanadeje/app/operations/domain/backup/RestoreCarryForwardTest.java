package cz.novanadeje.app.operations.domain.backup;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RestoreCarryForwardTest {

    @Test
    @DisplayName("Given counts of none or more, when what a restore carried forward is made, then it keeps every count")
    void should_keep_every_count_when_made_given_counts_of_none_or_more() {
        RestoreCarryForward carried = new RestoreCarryForward(1, 2, 0, 4, 1000);

        assertThat(carried.erasures()).isEqualTo(1);
        assertThat(carried.credentials()).isEqualTo(2);
        assertThat(carried.roles()).isZero();
        assertThat(carried.adminActions()).isEqualTo(4);
        assertThat(carried.receiptNumbersSkipped()).isEqualTo(1000);
    }

    @Test
    @DisplayName("Given a negative count, when what a restore carried forward is made, then it is refused")
    void should_refuse_when_made_given_a_negative_count() {
        assertThatThrownBy(() -> new RestoreCarryForward(-1, 0, 0, 0, 0)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new RestoreCarryForward(0, -1, 0, 0, 0)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new RestoreCarryForward(0, 0, -1, 0, 0)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new RestoreCarryForward(0, 0, 0, -1, 0)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new RestoreCarryForward(0, 0, 0, 0, -1)).isInstanceOf(IllegalArgumentException.class);
    }
}
