package cz.novanadeje.app.shared.infrastructure.schema;

import liquibase.command.CommandScope;
import liquibase.command.core.UpdateCommandStep;
import liquibase.command.core.helpers.DbUrlConnectionArgumentsCommandStep;
import liquibase.database.DatabaseFactory;
import liquibase.database.jvm.JdbcConnection;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;

import static org.assertj.core.api.Assertions.assertThat;

class MigrationOverDataTest {

    private static final String BASELINE_CHANGELOG = "migrations/baseline-changelog.xml";
    private static final String BASELINE_DATA = "/migrations/baseline-data.sql";
    private static final String CURRENT_CHANGELOG = "db/changelog/db.changelog-master.xml";

    @Test
    @DisplayName("Given a database migrated to the baseline with a row in every table, when the current changelogs run, then they apply and every row is still there")
    void should_apply_and_keep_every_row_when_current_changelogs_run_given_baseline_with_data() throws Exception {
        try (var postgres = new PostgreSQLContainer(DockerImageName.parse("postgres:17-alpine"))) {
            postgres.start();
            try (var connection = DriverManager.getConnection(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())) {
                migrate(connection, BASELINE_CHANGELOG);
                long baselineChangesets = appliedChangesets(connection);
                fill(connection);
                Map<String, Long> before = rowCounts(connection);

                migrate(connection, CURRENT_CHANGELOG);

                assertThat(before).as("tables of the baseline").isNotEmpty().allSatisfy((table, rows) ->
                        assertThat(rows).as("rows of %s in baseline-data.sql", table).isPositive());
                assertThat(appliedChangesets(connection)).isGreaterThanOrEqualTo(baselineChangesets);
                assertThat(rowCounts(connection)).containsAllEntriesOf(before);
            }
        }
    }

    private static void migrate(Connection connection, String changelog) throws Exception {
        var database = DatabaseFactory.getInstance().findCorrectDatabaseImplementation(new JdbcConnection(connection));
        new CommandScope(UpdateCommandStep.COMMAND_NAME)
                .addArgumentValue(DbUrlConnectionArgumentsCommandStep.DATABASE_ARG, database)
                .addArgumentValue(UpdateCommandStep.CHANGELOG_FILE_ARG, changelog)
                .execute();
    }

    private static void fill(Connection connection) throws IOException, SQLException {
        try (var script = Objects.requireNonNull(MigrationOverDataTest.class.getResourceAsStream(BASELINE_DATA));
             var statement = connection.createStatement()) {
            statement.execute(new String(script.readAllBytes(), StandardCharsets.UTF_8));
        }
    }

    private static long appliedChangesets(Connection connection) throws SQLException {
        try (var statement = connection.createStatement();
             var result = statement.executeQuery("select count(*) from databasechangelog")) {
            result.next();
            return result.getLong(1);
        }
    }

    private static Map<String, Long> rowCounts(Connection connection) throws SQLException {
        List<String> tables = new ArrayList<>();
        try (var statement = connection.createStatement();
             var result = statement.executeQuery("""
                     select table_name from information_schema.tables
                     where table_schema = 'public' and table_type = 'BASE TABLE' and table_name not like 'databasechangelog%'
                     """)) {
            while (result.next()) {
                tables.add(result.getString(1));
            }
        }
        Map<String, Long> counts = new TreeMap<>();
        for (String table : tables) {
            try (var statement = connection.createStatement();
                 var result = statement.executeQuery("select count(*) from public.\"" + table + "\"")) {
                result.next();
                counts.put(table, result.getLong(1));
            }
        }
        return counts;
    }
}
