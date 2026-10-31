package cz.novanadeje.app.shared.infrastructure.schema;

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

    static final List<ReviewedRowLoss> REVIEWED_ROW_LOSSES = List.of();

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
