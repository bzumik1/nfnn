package cz.novanadeje.app.shared.infrastructure.schema;

import cz.novanadeje.app.shared.infrastructure.schema.ReviewedRowLoss.Change;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import java.sql.DriverManager;
import java.util.List;
import java.util.Map;

import static cz.novanadeje.app.shared.infrastructure.schema.BaselineDatabase.BASELINE_CHANGELOG;
import static cz.novanadeje.app.shared.infrastructure.schema.BaselineDatabase.CURRENT_CHANGELOG;
import static org.assertj.core.api.Assertions.assertThat;

class MigrationOverDataTest {

    private static final String RECEIPT_SWITCH = "donations/024-delete-test-receipts-and-drop-the-server-drawing";
    private static final String RECEIPT_SWITCH_REASON = "plan v3 1.10: the site is not live, so every receipt issued so far is a test receipt"
            + " (D12, A2); the browser draws the PDF, and nothing reads the old tables any more";

    static final List<ReviewedRowLoss> REVIEWED_ROW_LOSSES = List.of(
            new ReviewedRowLoss("donation_receipt", RECEIPT_SWITCH, Change.DROPPED, RECEIPT_SWITCH_REASON),
            new ReviewedRowLoss("receipt_template", RECEIPT_SWITCH, Change.DROPPED, RECEIPT_SWITCH_REASON),
            new ReviewedRowLoss("issued_receipt", RECEIPT_SWITCH, Change.EMPTIED, RECEIPT_SWITCH_REASON));

    @Test
    @DisplayName("Given a database migrated to the baseline with a row in every table, when the current changelogs run, then they apply and every row is still there but those a reviewed row loss names")
    void should_apply_and_keep_every_row_but_reviewed_losses_when_current_changelogs_run_given_baseline_with_data() throws Exception {
        try (var postgres = new PostgreSQLContainer(DockerImageName.parse("postgres:17-alpine"))) {
            postgres.start();
            try (var connection = DriverManager.getConnection(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())) {
                BaselineDatabase.migrate(connection, BASELINE_CHANGELOG);
                int baselineChangesets = BaselineDatabase.appliedChangesets(connection).size();
                BaselineDatabase.fill(connection);
                Map<String, Long> before = BaselineDatabase.rowCounts(connection);

                BaselineDatabase.migrate(connection, CURRENT_CHANGELOG);

                assertThat(before).as("tables of the baseline").isNotEmpty().allSatisfy((table, rows) ->
                        assertThat(rows).as("rows of %s in baseline-data.sql", table).isPositive());
                var applied = BaselineDatabase.appliedChangesets(connection);
                assertThat(applied.size()).isGreaterThanOrEqualTo(baselineChangesets);
                assertThat(ReviewedRowLoss.violations(REVIEWED_ROW_LOSSES, before, BaselineDatabase.rowCounts(connection), applied)).isEmpty();
            }
        }
    }
}
