package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.PersistenceTest;
import cz.novanadeje.app.shared.infrastructure.lock.AdvisoryLock;
import cz.novanadeje.app.support.DatabaseCleaner;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@PersistenceTest
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class IssuedReceiptImmutabilityTest {

    private static final UUID DONOR = UUID.fromString("0190a000-0000-7000-8000-000000000201");
    private static final UUID RECEIPT = UUID.fromString("0190a000-0000-7000-8000-000000000202");
    private static final String FROZEN = "{\"gifts\": [{\"receivedOn\": \"2025-03-15\"}, {\"receivedOn\": \"2025-04-15\"}], \"total\": {\"amountMinor\": 100000}}";
    private static final String REFUSED = "an issued receipt keeps what it certifies";

    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private PlatformTransactionManager transactionManager;

    @BeforeEach
    void storeAnActiveYearlyReceipt() {
        new DatabaseCleaner(jdbc).emptyAllTables();
        jdbc.sql("insert into donor_record (donor_id, type, name, company_identifier, street, city, postal_code, variable_symbol, preferred_locale, "
                        + "registered_at, updated_at, erased_at) values (?, 'PERSON', 'Dárce', null, 'Dlouhá 12', 'Ústí nad Labem', '400 01', '4821937560', "
                        + "'cs', now(), now(), null)")
                .param(DONOR).update();
        jdbc.sql("insert into receipt_signing_key (key_id, public_key, registered_at, status, seal) values ('0a1b2c3d', ?, now(), 'active', 'seal')")
                .param(new byte[32]).update();
        jdbc.sql("insert into issued_receipt (id, donor_id, kind, donation_id, receipt_year, number, issued_on, issued_at, locale, fingerprint, status, "
                        + "schema_version, frozen, signing_key_id, proof, status_sha256) values (?, ?, 'YEARLY', null, 2025, '2026-000001', '2026-01-09', "
                        + "'2026-01-09T10:00:00Z', 'cs', repeat('5', 64), 'ACTIVE', 1, ?, '0a1b2c3d', ?, repeat('6', 64))")
                .params(RECEIPT, DONOR, FROZEN, new byte[65]).update();
    }

    @AfterEach
    void emptyTheTables() {
        new DatabaseCleaner(jdbc).emptyAllTables();
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {
            "frozen = '{}'",
            "number = '1999-000001'",
            "proof = decode(repeat('ab', 65), 'hex')",
            "status_sha256 = repeat('7', 64)",
            "fingerprint = repeat('8', 64)",
            "issued_on = '2019-01-01'",
            "issued_at = now()",
            "locale = 'en'",
            "receipt_year = 2024",
            "signing_key_id = '0a1b2c3d', id = '0190a000-0000-7000-8000-000000000299'",
            "schema_version = 1, supersedes_id = '0190a000-0000-7000-8000-000000000202'",
            "status = 'REPLACED', superseded_at = now(), frozen = '{}'"})
    @DisplayName("Given an active issued receipt, when a statement changes what it certifies, also beside a status change, then the database refuses it and the receipt stays as issued")
    void should_refuse_and_keep_the_receipt_when_what_it_certifies_changes_given_an_active_receipt(String assignments) {
        assertThatThrownBy(() -> jdbc.sql("update issued_receipt set " + assignments + " where id = ?").param(RECEIPT).update())
                .isInstanceOf(DataAccessException.class)
                .hasMessageContaining(REFUSED);

        assertThat(row()).containsEntry("number", "2026-000001").containsEntry("status", "ACTIVE").containsEntry("frozen", FROZEN);
    }

    @Test
    @DisplayName("Given an issued receipt, when a statement deletes it, then the database refuses it and the receipt stays")
    void should_refuse_and_keep_the_receipt_when_deleted_given_an_issued_receipt() {
        assertThatThrownBy(() -> jdbc.sql("delete from issued_receipt where id = ?").param(RECEIPT).update())
                .isInstanceOf(DataAccessException.class)
                .hasMessageContaining(REFUSED);

        assertThat(count()).isOne();
    }

    @Test
    @DisplayName("Given an issued receipt, when the table is truncated, then the database refuses it and the receipt stays")
    void should_refuse_and_keep_the_receipt_when_the_table_is_truncated_given_an_issued_receipt() {
        assertThatThrownBy(() -> jdbc.sql("truncate issued_receipt").update())
                .isInstanceOf(DataAccessException.class)
                .hasMessageContaining(REFUSED);

        assertThat(count()).isOne();
    }

    @Test
    @DisplayName("Given an active receipt, when it is replaced, then the database takes the status and supersede time and keeps its summary columns")
    void should_take_replacement_and_keep_summary_when_replaced_given_an_active_receipt() {
        jdbc.sql("update issued_receipt set status = 'REPLACED', superseded_at = now() where id = ?").param(RECEIPT).update();

        assertThat(row()).containsEntry("status", "REPLACED").containsEntry("gift_count", 2).containsEntry("total_amount_minor", 100000L)
                .containsEntry("certified_year", 2025);
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {
            "status = 'WITHDRAWN', withdrawn_at = now(), withdrawal_reason = 'DONATIONS_CHANGED'",
            "status = 'WITHDRAWN'",
            "status = 'ACTIVE'"})
    @DisplayName("Given an active receipt, when it is withdrawn, with or without a reason, or saved unchanged, then the database takes it")
    void should_take_the_change_when_withdrawn_or_saved_unchanged_given_an_active_receipt(String assignments) {
        assertThat(jdbc.sql("update issued_receipt set " + assignments + " where id = ?").param(RECEIPT).update()).isOne();
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {
            "status = 'ACTIVE', superseded_at = null",
            "superseded_at = now() + interval '1 day'",
            "status = 'WITHDRAWN', superseded_at = null, withdrawn_at = now(), withdrawal_reason = 'DONATIONS_CHANGED'"})
    @DisplayName("Given a replaced receipt, when its status or supersede time changes, then the database refuses it, because a receipt leaves ACTIVE at most once")
    void should_refuse_when_status_changes_given_a_replaced_receipt(String assignments) {
        jdbc.sql("update issued_receipt set status = 'REPLACED', superseded_at = now() where id = ?").param(RECEIPT).update();

        assertThatThrownBy(() -> jdbc.sql("update issued_receipt set " + assignments + " where id = ?").param(RECEIPT).update())
                .isInstanceOf(DataAccessException.class)
                .hasMessageContaining(REFUSED);
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {
            "status = 'ACTIVE', withdrawn_at = null, withdrawal_reason = null",
            "status = 'REPLACED', superseded_at = now(), withdrawn_at = null, withdrawal_reason = null",
            "withdrawn_at = now() + interval '1 day'"})
    @DisplayName("Given a withdrawn receipt, when its status or withdrawal changes, then the database refuses it, because a receipt leaves ACTIVE at most once")
    void should_refuse_when_status_changes_given_a_withdrawn_receipt(String assignments) {
        jdbc.sql("update issued_receipt set status = 'WITHDRAWN', withdrawn_at = now(), withdrawal_reason = 'DONATIONS_CHANGED' where id = ?")
                .param(RECEIPT).update();

        assertThatThrownBy(() -> jdbc.sql("update issued_receipt set " + assignments + " where id = ?").param(RECEIPT).update())
                .isInstanceOf(DataAccessException.class)
                .hasMessageContaining(REFUSED);
    }

    @Test
    @DisplayName("Given an issued receipt and a migration whose session holds the migration lock, when the migration rewrites and deletes it, then the database lets it")
    void should_let_a_migration_rewrite_and_delete_when_its_session_holds_the_migration_lock_given_an_issued_receipt() {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            jdbc.sql("select 1 from pg_advisory_lock(:key)").param("key", AdvisoryLock.SCHEMA_MIGRATION.key()).query(Integer.class).single();
            try {
                jdbc.sql("update issued_receipt set number = '2026-000099' where id = ?").param(RECEIPT).update();
                assertThat(row()).containsEntry("number", "2026-000099");
                jdbc.sql("delete from issued_receipt where id = ?").param(RECEIPT).update();
                assertThat(count()).isZero();
            } finally {
                jdbc.sql("select pg_advisory_unlock(:key)").param("key", AdvisoryLock.SCHEMA_MIGRATION.key()).query(Boolean.class).single();
            }
        });
    }

    @Test
    @DisplayName("Given an issued receipt and a transaction lock of another kind, when a statement deletes the receipt, then the database still refuses it")
    void should_refuse_the_delete_when_the_session_holds_another_advisory_lock_given_an_issued_receipt() {
        assertThatThrownBy(() -> new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            jdbc.sql("select 1 from pg_advisory_xact_lock(:key)").param("key", AdvisoryLock.PAIRING.key()).query(Integer.class).single();
            jdbc.sql("delete from issued_receipt where id = ?").param(RECEIPT).update();
        })).hasMessageContaining(REFUSED);

        assertThat(count()).isOne();
    }

    private Map<String, Object> row() {
        return jdbc.sql("select number, status, frozen, gift_count, total_amount_minor, certified_year from issued_receipt where id = ?")
                .param(RECEIPT).query().singleRow();
    }

    private long count() {
        return jdbc.sql("select count(*) from issued_receipt where id = ?").param(RECEIPT).query(Long.class).single();
    }
}
