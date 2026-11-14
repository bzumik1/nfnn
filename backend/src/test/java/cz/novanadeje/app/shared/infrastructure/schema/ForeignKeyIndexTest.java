package cz.novanadeje.app.shared.infrastructure.schema;

import cz.novanadeje.app.PersistenceTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@PersistenceTest
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

        assertThat(foreignKeys).isPositive();
        assertThat(foreignKeysWithoutAnIndex()).isEmpty();
    }

    @Test
    @DisplayName("Given a foreign key led only by a partial index beside one led by a whole index, when the foreign keys are read, then only the one under the partial index is reported, since a partial index does not serve every lookup of a parent's children")
    void should_report_the_foreign_key_when_read_given_only_a_partial_index_leads_it() {
        jdbc.sql("create table fk_probe_parent (id uuid primary key)").update();
        jdbc.sql("create table fk_probe_partly (id uuid primary key, parent_id uuid not null, kind varchar(10) not null,"
                + " constraint fk_probe_partly_parent foreign key (parent_id) references fk_probe_parent (id))").update();
        jdbc.sql("create index ix_fk_probe_partly_parent on fk_probe_partly (parent_id) where kind = 'OPEN'").update();
        jdbc.sql("create table fk_probe_wholly (id uuid primary key, parent_id uuid not null,"
                + " constraint fk_probe_wholly_parent foreign key (parent_id) references fk_probe_parent (id))").update();
        jdbc.sql("create index ix_fk_probe_wholly_parent on fk_probe_wholly (parent_id)").update();

        assertThat(foreignKeysWithoutAnIndex()).containsExactly("fk_probe_partly.fk_probe_partly_parent");
    }

    private List<String> foreignKeysWithoutAnIndex() {
        return jdbc.sql("""
                select c.conrelid::regclass::text || '.' || c.conname
                from pg_constraint c
                where c.contype = 'f'
                  and c.connamespace = 'public'::regnamespace
                  and not exists (
                      select 1 from pg_index i
                      where i.indrelid = c.conrelid
                        and i.indpred is null
                        and (string_to_array(i.indkey::text, ' ')::int2[])[1:cardinality(c.conkey)] @> c.conkey
                        and (string_to_array(i.indkey::text, ' ')::int2[])[1:cardinality(c.conkey)] <@ c.conkey)
                order by 1
                """).query(String.class).list();
    }
}
