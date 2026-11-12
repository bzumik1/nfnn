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
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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

    @Test
    @DisplayName("Given an administrator's action, which the database keeps append-only, when every table is emptied, then the trail is empty too and keeps refusing a delete afterwards")
    void should_empty_the_append_only_trail_and_keep_it_append_only_when_emptied_given_an_administrators_action() {
        jdbc.sql("insert into admin_action (id, admin_id, action, details, performed_at) "
                + "values ('0190a000-0000-7000-8000-000000000004', '0190a000-0000-7000-8000-000000000005', 'PAIR_PAYMENT', 'Spárováno', '2026-01-10T10:00:00Z')").update();

        new DatabaseCleaner(jdbc).emptyAllTables();

        assertThat(jdbc.sql("select count(*) from admin_action").query(Long.class).single()).isZero();
        jdbc.sql("insert into admin_action (id, admin_id, action, details, performed_at) "
                + "values ('0190a000-0000-7000-8000-000000000006', '0190a000-0000-7000-8000-000000000005', 'PAIR_PAYMENT', 'Spárováno', '2026-01-10T10:00:00Z')").update();
        assertThatThrownBy(() -> jdbc.sql("delete from admin_action").update()).hasMessageContaining("admin_action is append-only");
    }

    @Test
    @DisplayName("Given an issued receipt, which the database keeps as issued, when every table is emptied, then no receipt is left and the table keeps refusing a delete afterwards")
    void should_empty_issued_receipts_and_keep_them_as_issued_when_emptied_given_an_issued_receipt() {
        insertIssuedReceipt("0190a000-0000-7000-8000-000000000008", "2026-000001");

        new DatabaseCleaner(jdbc).emptyAllTables();

        assertThat(jdbc.sql("select count(*) from issued_receipt").query(Long.class).single()).isZero();
        insertIssuedReceipt("0190a000-0000-7000-8000-000000000009", "2026-000002");
        assertThatThrownBy(() -> jdbc.sql("delete from issued_receipt").update()).hasMessageContaining("an issued receipt keeps what it certifies");
    }

    private void insertIssuedReceipt(String id, String number) {
        jdbc.sql("insert into donor_record (donor_id, type, name, street, city, postal_code, variable_symbol, preferred_locale, registered_at, updated_at) "
                + "values ('0190a000-0000-7000-8000-000000000007', 'PERSON', 'Dárce', 'Ulice 1', 'Město', '110 00', '1000000001', 'cs', "
                + "'2026-01-10T10:00:00Z', '2026-01-10T10:00:00Z') on conflict do nothing").update();
        jdbc.sql("insert into receipt_signing_key (key_id, public_key, registered_at, status, seal) "
                + "values ('0a1b2c3d', decode(repeat('ab', 32), 'hex'), '2026-01-10T10:00:00Z', 'active', 'seal') on conflict do nothing").update();
        jdbc.sql("insert into issued_receipt (id, donor_id, kind, receipt_year, number, issued_on, issued_at, locale, fingerprint, status, schema_version, "
                + "frozen, signing_key_id, proof, status_sha256) values ('" + id + "', '0190a000-0000-7000-8000-000000000007', 'YEARLY', 2025, '" + number
                + "', '2026-01-10', '2026-01-10T10:00:00Z', 'cs', repeat('5', 64), 'ACTIVE', 1, '{}', '0a1b2c3d', decode(repeat('cd', 65), 'hex'), "
                + "repeat('" + number.charAt(number.length() - 1) + "', 64))").update();
    }

    private Map<String, Long> rowCounts() {
        List<String> tables = jdbc.sql("select tablename from pg_tables where schemaname = 'public' and tablename not like 'databasechangelog%'")
                .query(String.class).list();
        return tables.stream().collect(Collectors.toMap(table -> table,
                table -> jdbc.sql("select count(*) from " + table).query(Long.class).single()));
    }
}
