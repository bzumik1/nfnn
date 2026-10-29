package cz.novanadeje.app.support;

import cz.novanadeje.app.TestcontainersConfiguration;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(TestcontainersConfiguration.class)
class DatabaseCleanerTest {

    @Autowired
    private JdbcClient jdbc;

    @Test
    @DisplayName("Given rows in tables that reference each other and a used receipt number, when every table is emptied, then no table keeps a row and receipt numbers start again at 1")
    void should_leave_every_table_empty_and_restart_sequences_when_emptied_given_referencing_rows() {
        jdbc.sql("insert into content_media (id, width, height, uploaded_at) values ('0190a000-0000-7000-8000-000000000001', 1600, 900, '2026-01-10T10:00:00Z')").update();
        jdbc.sql("insert into content_media_variant (id, media_id, width, height, data) "
                + "values ('0190a000-0000-7000-8000-000000000002', '0190a000-0000-7000-8000-000000000001', 800, 450, '\\x52494646')").update();
        jdbc.sql("insert into content_news (id, slug, title, tag, perex, body, cover_media_id, published_on, created_at, updated_at) "
                + "values ('0190a000-0000-7000-8000-000000000003', 'letni-tabor', 'Letní tábor', 'Akce', 'Perex', 'Text', "
                + "'0190a000-0000-7000-8000-000000000001', '2026-01-11', '2026-01-10T10:00:00Z', '2026-01-10T10:00:00Z')").update();
        jdbc.sql("select nextval('donation_receipt_number_seq')").query(Long.class).single();
        jdbc.sql("select nextval('donation_receipt_number_seq')").query(Long.class).single();

        new DatabaseCleaner(jdbc).emptyAllTables();

        assertThat(rowCounts()).isNotEmpty().allSatisfy((table, rows) -> assertThat(rows).as("rows of %s", table).isZero());
        assertThat(jdbc.sql("select nextval('donation_receipt_number_seq')").query(Long.class).single()).isEqualTo(1L);
    }

    private Map<String, Long> rowCounts() {
        List<String> tables = jdbc.sql("select tablename from pg_tables where schemaname = 'public' and tablename not like 'databasechangelog%'")
                .query(String.class).list();
        return tables.stream().collect(Collectors.toMap(table -> table,
                table -> jdbc.sql("select count(*) from " + table).query(Long.class).single()));
    }
}
