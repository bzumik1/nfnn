package cz.novanadeje.app.shared.infrastructure.schema;

import cz.novanadeje.app.shared.infrastructure.schema.ReviewedRowLoss.Change;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ReviewedRowLossTest {

    private static final String CHANGESET = "024-switch";
    private static final ReviewedRowLoss DROPPED = new ReviewedRowLoss("old_table", CHANGESET, Change.DROPPED, "the switch drops it");
    private static final ReviewedRowLoss EMPTIED = new ReviewedRowLoss("test_rows", CHANGESET, Change.EMPTIED, "the switch deletes them");

    @Test
    @DisplayName("Given a table dropped and a table emptied as reviewed, when the migration is checked, then nothing is reported")
    void should_report_nothing_when_checked_given_losses_as_reviewed() {
        var violations = ReviewedRowLoss.violations(List.of(DROPPED, EMPTIED),
                Map.of("old_table", 1L, "test_rows", 2L, "donation", 3L), Map.of("test_rows", 0L, "donation", 4L), Set.of(CHANGESET));

        assertThat(violations).isEmpty();
    }

    @Test
    @DisplayName("Given a table that lost rows without a reviewed row loss, when the migration is checked, then the table is reported")
    void should_report_the_table_when_checked_given_rows_lost_without_review() {
        var violations = ReviewedRowLoss.violations(List.of(), Map.of("donation", 3L, "contact_message", 1L), Map.of("donation", 2L), Set.of());

        assertThat(violations).containsExactlyInAnyOrder("donation kept 2 of its 3 rows, and no reviewed row loss names it",
                "contact_message is gone, and no reviewed row loss names it");
    }

    @Test
    @DisplayName("Given a reviewed row loss whose table still holds its rows, when the migration is checked, then the stale review is reported")
    void should_report_the_review_when_checked_given_the_table_still_holds_its_rows() {
        var violations = ReviewedRowLoss.violations(List.of(DROPPED, EMPTIED),
                Map.of("old_table", 1L, "test_rows", 2L), Map.of("old_table", 1L, "test_rows", 2L), Set.of(CHANGESET));

        assertThat(violations).containsExactlyInAnyOrder(
                "old_table was reviewed as dropped by 024-switch, but it is still there with 1 rows",
                "test_rows was reviewed as emptied by 024-switch, but it still has 2 rows");
    }

    @Test
    @DisplayName("Given a reviewed row loss whose changeset did not run, when the migration is checked, then the missing changeset is reported")
    void should_report_the_changeset_when_checked_given_it_did_not_run() {
        var violations = ReviewedRowLoss.violations(List.of(DROPPED), Map.of("old_table", 1L), Map.of(), Set.of("023-other"));

        assertThat(violations).containsExactly("the changeset 024-switch that loses the rows of old_table did not run");
    }

    @Test
    @DisplayName("Given a reviewed row loss for a table the baseline leaves empty, when the migration is checked, then the empty proof is reported")
    void should_report_the_empty_proof_when_checked_given_no_baseline_rows() {
        var violations = ReviewedRowLoss.violations(List.of(EMPTIED), Map.of("test_rows", 0L), Map.of("test_rows", 0L), Set.of(CHANGESET));

        assertThat(violations).containsExactly("test_rows has no rows in the baseline, so the reviewed row loss of 024-switch proves nothing");
    }

    @Test
    @DisplayName("Given a reviewed row loss without its reason, when it is written, then it is refused")
    void should_refuse_when_written_given_no_reason() {
        assertThatThrownBy(() -> new ReviewedRowLoss("old_table", CHANGESET, Change.DROPPED, " "))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
