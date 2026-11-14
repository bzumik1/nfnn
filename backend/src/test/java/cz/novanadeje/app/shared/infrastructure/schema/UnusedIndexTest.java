package cz.novanadeje.app.shared.infrastructure.schema;

import cz.novanadeje.app.PersistenceTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import static org.assertj.core.api.Assertions.assertThat;

@PersistenceTest
class UnusedIndexTest {

    @Autowired
    private JdbcClient jdbc;

    @Test
    @DisplayName("Given the migrated schema, when its plain indexes are read, then none repeats the leading columns of another index on its table, so no write pays for an index the longer one already serves")
    void should_find_no_plain_index_that_another_index_starts_with_when_indexes_read_given_migrated_schema() {
        var indexes = jdbc.sql("""
                select count(*) from pg_index i join pg_class t on t.oid = i.indrelid
                where t.relnamespace = 'public'::regnamespace
                """).query(Long.class).single();
        var redundant = jdbc.sql("""
                select shorter.indexrelid::regclass::text || ' (covered by ' || longer.indexrelid::regclass::text || ')'
                from pg_index shorter
                join pg_class t on t.oid = shorter.indrelid
                join pg_index longer on longer.indrelid = shorter.indrelid and longer.indexrelid <> shorter.indexrelid
                where t.relnamespace = 'public'::regnamespace
                  and not shorter.indisunique
                  and shorter.indpred is null
                  and shorter.indexprs is null
                  and longer.indpred is null
                  and longer.indexprs is null
                  and longer.indnkeyatts > shorter.indnkeyatts
                  and (string_to_array(longer.indkey::text, ' ')::int2[])[1:shorter.indnkeyatts]
                      = (string_to_array(shorter.indkey::text, ' ')::int2[])[1:shorter.indnkeyatts]
                order by 1
                """).query(String.class).list();

        assertThat(indexes).isPositive();
        assertThat(redundant).isEmpty();
    }

    @Test
    @DisplayName("Given the migrated schema, when the audit trail's indexes are read, then they are exactly the key and the two its queries use: by action and time, and by time and id")
    void should_index_only_what_the_trail_queries_when_admin_action_indexes_read_given_migrated_schema() {
        var names = jdbc.sql("""
                select indexname from pg_indexes
                where schemaname = 'public' and tablename = 'admin_action'
                order by indexname
                """).query(String.class).list();

        assertThat(names).containsExactly("ix_admin_action_action_performed_at", "ix_admin_action_performed_at_id", "pk_admin_action");
    }
}
