package cz.novanadeje.app.support;

import org.springframework.jdbc.core.simple.JdbcClient;

import java.util.List;
import java.util.Set;

public class DatabaseCleaner {

    private static final Set<String> LIQUIBASE_TABLES = Set.of("databasechangelog", "databasechangeloglock");

    private final JdbcClient jdbc;

    public DatabaseCleaner(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public void truncateAllTables() {
        List<String> tables = jdbc.sql("select tablename from pg_tables where schemaname = 'public'")
                .query(String.class)
                .list()
                .stream()
                .filter(table -> !LIQUIBASE_TABLES.contains(table))
                .toList();
        if (tables.isEmpty()) {
            return;
        }
        jdbc.sql("truncate table " + String.join(", ", tables) + " restart identity cascade").update();
    }
}
