package cz.novanadeje.app.support;

import org.springframework.jdbc.core.simple.JdbcClient;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public class DatabaseCleaner {

    private static final Set<String> LIQUIBASE_TABLES = Set.of("databasechangelog", "databasechangeloglock");

    private final JdbcClient jdbc;

    public DatabaseCleaner(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public void emptyAllTables() {
        List<String> statements = Stream.concat(
                        deletionOrder().stream().map(table -> "delete from " + table),
                        sequences().stream().map(sequence -> "alter sequence " + sequence + " restart"))
                .toList();
        if (!statements.isEmpty()) {
            jdbc.sql(String.join(";\n", statements)).update();
        }
    }

    private List<String> deletionOrder() {
        Set<String> remaining = new LinkedHashSet<>(tables());
        List<Reference> references = references();
        List<String> order = new ArrayList<>();
        while (!remaining.isEmpty()) {
            Set<String> referenced = references.stream()
                    .filter(reference -> remaining.contains(reference.child()))
                    .map(Reference::parent)
                    .collect(Collectors.toSet());
            List<String> unreferenced = remaining.stream().filter(table -> !referenced.contains(table)).toList();
            if (unreferenced.isEmpty()) {
                throw new IllegalStateException("The foreign keys among " + remaining + " form a cycle, so no table can be emptied first");
            }
            order.addAll(unreferenced);
            unreferenced.forEach(remaining::remove);
        }
        return order;
    }

    private List<String> tables() {
        return jdbc.sql("select tablename from pg_tables where schemaname = 'public' order by tablename")
                .query(String.class)
                .list()
                .stream()
                .filter(table -> !LIQUIBASE_TABLES.contains(table))
                .toList();
    }

    private List<Reference> references() {
        return jdbc.sql("""
                        select child.relname, parent.relname
                        from pg_constraint c
                        join pg_class child on child.oid = c.conrelid
                        join pg_class parent on parent.oid = c.confrelid
                        where c.contype = 'f' and c.connamespace = 'public'::regnamespace and c.conrelid <> c.confrelid
                        """)
                .query((row, number) -> new Reference(row.getString(1), row.getString(2)))
                .list();
    }

    private List<String> sequences() {
        return jdbc.sql("select sequencename from pg_sequences where schemaname = 'public' order by sequencename")
                .query(String.class)
                .list();
    }

    private record Reference(String child, String parent) {
    }
}
