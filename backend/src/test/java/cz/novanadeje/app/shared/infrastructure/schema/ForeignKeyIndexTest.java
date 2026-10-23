package cz.novanadeje.app.shared.infrastructure.schema;

import cz.novanadeje.app.TestcontainersConfiguration;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(TestcontainersConfiguration.class)
class ForeignKeyIndexTest {

    @Autowired
    private JdbcClient jdbc;

    @Test
    @DisplayName("Given the migrated schema, when its foreign keys are read, then each one leads an index, so deleting a parent row or reading its children never scans the child table")
    void should_lead_an_index_when_foreign_keys_read_given_migrated_schema() {
        var foreignKeys = jdbc.sql("""
                select count(*) from pg_constraint
                where contype = 'f' and connamespace = 'public'::regnamespace
                """).query(Long.class).single();
        var unindexed = jdbc.sql("""
                select c.conrelid::regclass::text || '.' || c.conname
                from pg_constraint c
                where c.contype = 'f'
                  and c.connamespace = 'public'::regnamespace
                  and not exists (
                      select 1 from pg_index i
                      where i.indrelid = c.conrelid
                        and (string_to_array(i.indkey::text, ' ')::int2[])[1:cardinality(c.conkey)] @> c.conkey
                        and (string_to_array(i.indkey::text, ' ')::int2[])[1:cardinality(c.conkey)] <@ c.conkey)
                order by 1
                """).query(String.class).list();

        assertThat(foreignKeys).isPositive();
        assertThat(unindexed).isEmpty();
    }
}
