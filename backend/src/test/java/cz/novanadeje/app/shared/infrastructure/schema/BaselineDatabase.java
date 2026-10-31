package cz.novanadeje.app.shared.infrastructure.schema;

import liquibase.command.CommandScope;
import liquibase.command.core.UpdateCommandStep;
import liquibase.command.core.helpers.DbUrlConnectionArgumentsCommandStep;
import liquibase.database.DatabaseFactory;
import liquibase.database.jvm.JdbcConnection;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;

final class BaselineDatabase {

    static final String BASELINE_CHANGELOG = "migrations/baseline-changelog.xml";
    static final String CURRENT_CHANGELOG = "db/changelog/db.changelog-master.xml";
    private static final String BASELINE_DATA = "/migrations/baseline-data.sql";

    private BaselineDatabase() {
    }

    static void migrate(Connection connection, String changelog) throws Exception {
        var database = DatabaseFactory.getInstance().findCorrectDatabaseImplementation(new JdbcConnection(connection));
        new CommandScope(UpdateCommandStep.COMMAND_NAME)
                .addArgumentValue(DbUrlConnectionArgumentsCommandStep.DATABASE_ARG, database)
                .addArgumentValue(UpdateCommandStep.CHANGELOG_FILE_ARG, changelog)
                .execute();
    }

    static void fill(Connection connection) throws IOException, SQLException {
        fill(connection, BASELINE_DATA);
    }

    static void fill(Connection connection, String data) throws IOException, SQLException {
        try (var script = Objects.requireNonNull(BaselineDatabase.class.getResourceAsStream(data));
             var statement = connection.createStatement()) {
            statement.execute(new String(script.readAllBytes(), StandardCharsets.UTF_8));
        }
    }

    static List<String> appliedChangesets(Connection connection) throws SQLException {
        List<String> ids = new ArrayList<>();
        try (var statement = connection.createStatement();
             var result = statement.executeQuery("select filename, id from databasechangelog order by orderexecuted")) {
            while (result.next()) {
                ids.add(contextOf(result.getString(1)) + "/" + result.getString(2));
            }
        }
        return ids;
    }

    static Map<String, Long> rowCounts(Connection connection) throws SQLException {
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
            counts.put(table, count(connection, "select count(*) from public.\"" + table + "\""));
        }
        return counts;
    }

    static long count(Connection connection, String query) throws SQLException {
        try (var statement = connection.createStatement();
             var result = statement.executeQuery(query)) {
            result.next();
            return result.getLong(1);
        }
    }

    private static String contextOf(String changelogFile) {
        String[] folders = changelogFile.split("/");
        return folders[folders.length - 2];
    }
}
