package cz.novanadeje.app.shared.infrastructure.schema;

import cz.novanadeje.app.TestcontainersConfiguration;
import cz.novanadeje.app.sharedcases.SharedCases;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.sql.DriverManager;
import java.util.List;
import java.util.Map;

import static cz.novanadeje.app.shared.infrastructure.schema.BaselineDatabase.BASELINE_CHANGELOG;
import static cz.novanadeje.app.shared.infrastructure.schema.BaselineDatabase.CURRENT_CHANGELOG;
import static org.assertj.core.api.Assertions.assertThat;

class MigrationOverDataTest {

    static final String BASELINE_REVISION = "d953749";
    static final List<ReviewedRowLoss> REVIEWED_ROW_LOSSES = List.of();

    @Test
    @DisplayName("Given the baseline changelog, when it is compared with the master and the revision the server runs, then it is taken at that revision and names the master's files in the master's order")
    void should_be_taken_at_the_deployed_revision_in_master_order_when_compared_given_the_baseline_changelog() throws Exception {
        var root = SharedCases.repositoryRoot();

        var problems = BaselineChangelog.read(BASELINE_REVISION).problems(BaselineChangelog.masterFiles(root), BaselineChangelog.deployedRevision(root));

        assertThat(problems).isEmpty();
    }

    @Test
    @DisplayName("Given a database migrated to the baseline with a row in every table, when the current changelogs run, then they apply and every row is still there but those a reviewed row loss names")
    void should_apply_and_keep_every_row_but_reviewed_losses_when_current_changelogs_run_given_baseline_with_data() throws Exception {
        try (var postgres = TestcontainersConfiguration.newPostgres()) {
            postgres.start();
            try (var connection = DriverManager.getConnection(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())) {
                BaselineDatabase.migrate(connection, BASELINE_CHANGELOG);
                int baselineChangesets = BaselineDatabase.appliedChangesets(connection).size();
                BaselineDatabase.fill(connection);
                Map<String, Long> before = BaselineDatabase.rowCounts(connection);

                BaselineDatabase.migrate(connection, CURRENT_CHANGELOG);

                assertThat(before.entrySet().stream().filter(table -> table.getValue() == 0).map(Map.Entry::getKey))
                        .as("tables of the baseline without a row in baseline-data.sql").isEmpty();
                assertThat(before).as("tables of the baseline").isNotEmpty();
                var applied = BaselineDatabase.appliedChangesets(connection);
                assertThat(applied.size()).isGreaterThanOrEqualTo(baselineChangesets);
                assertThat(ReviewedRowLoss.violations(REVIEWED_ROW_LOSSES, before, BaselineDatabase.rowCounts(connection), applied)).isEmpty();
            }
        }
    }
}
