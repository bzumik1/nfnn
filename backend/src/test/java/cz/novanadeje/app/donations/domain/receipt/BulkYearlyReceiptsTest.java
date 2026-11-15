package cz.novanadeje.app.donations.domain.receipt;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BulkYearlyReceiptsTest {

    @Test
    @DisplayName("Given a run of 1 to 50 donors, when it is checked, then it passes")
    void should_pass_when_checked_given_a_run_within_the_bounds() {
        assertThatNoException().isThrownBy(() -> BulkYearlyReceipts.check(1));
        assertThatNoException().isThrownBy(() -> BulkYearlyReceipts.check(BulkYearlyReceipts.MAX_DONORS));
    }

    @Test
    @DisplayName("Given a run of no donor or of more than 50, when it is checked, then it is refused")
    void should_refuse_when_checked_given_a_run_outside_the_bounds() {
        assertThatThrownBy(() -> BulkYearlyReceipts.check(0)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> BulkYearlyReceipts.check(51)).isInstanceOf(IllegalArgumentException.class);
    }
}
