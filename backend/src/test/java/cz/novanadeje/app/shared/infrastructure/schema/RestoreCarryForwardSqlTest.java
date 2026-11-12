package cz.novanadeje.app.shared.infrastructure.schema;

import cz.novanadeje.app.TestcontainersConfiguration;
import cz.novanadeje.app.sharedcases.SharedCases;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.UncategorizedSQLException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(TestcontainersConfiguration.class)
class RestoreCarryForwardSqlTest {

    private static final Path CARRY_FORWARD = Path.of("deploy", "backup", "carry-forward.sql");

    private static final String ERASED = "019a0000-0000-7000-8000-0000000000a1";
    private static final String NEW_PASSWORD = "019a0000-0000-7000-8000-0000000000a2";
    private static final String DEMOTED = "019a0000-0000-7000-8000-0000000000a3";
    private static final String PROMOTED = "019a0000-0000-7000-8000-0000000000a4";
    private static final String UNCHANGED = "019a0000-0000-7000-8000-0000000000a5";
    private static final String ONLY_BEFORE_THE_RESTORE = "019a0000-0000-7000-8000-0000000000a6";
    private static final String KEPT_PASSKEY = "019a0000-0000-7000-8000-0000000000b1";
    private static final String REMOVED_PASSKEY = "019a0000-0000-7000-8000-0000000000b2";
    private static final String ADDED_PASSKEY = "019a0000-0000-7000-8000-0000000000b3";
    private static final String TRAIL_IN_BOTH = "019a0000-0000-7000-8000-0000000000c1";
    private static final String TRAIL_AFTER_THE_DUMP = "019a0000-0000-7000-8000-0000000000c2";
    private static final String TRAIL_OF_THE_RESTORE_REQUEST = "019a0000-0000-7000-8000-0000000000c3";
    private static final String OLD_HASH = "$2a$12$abcdefghijklmnopqrstuuSq0kE0Wn0vNnU5o9bqv1x6r0b8eQm2C";
    private static final String NEW_HASH = "$2a$12$zyxwvutsrqponmlkjihgfeSq0kE0Wn0vNnU5o9bqv1x6r0b8eQm2C";
    private static final long AUDIT_TRAIL_LOCK = 20261110L;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private JdbcTemplate statements;

    @BeforeEach
    void loadTheCarryForwardIntoThisSession() throws IOException {
        statements.execute(Files.readString(SharedCases.repositoryRoot().resolve(CARRY_FORWARD), StandardCharsets.UTF_8));
        statements.execute("create temp table carried (kind text not null, fact jsonb not null)");
        statements.execute("create temp table read_facts (kind text not null, fact jsonb not null)");
    }

    @Test
    @DisplayName("Given a database that erased a donor, changed a password, swapped a passkey, replaced a second factor, took and gave the administrator role and wrote to the audit trail after the dump, when the restored copy carries its facts forward, then the erasure, the credentials, the roles and the trail come along, a donor only the database had stays out, and the counts name each")
    void should_keep_erasures_credentials_roles_and_trail_when_carried_forward_given_changes_after_the_dump() {
        donor(ERASED, "Vymazaný dárce", null, "9000000001");
        statements.execute("update donor set erased_at = now() - interval '1 day' where id = '" + ERASED + "'::uuid");
        statements.execute("delete from donor_role where donor_id = '" + ERASED + "'::uuid");
        donor(NEW_PASSWORD, "Změněné Heslo", NEW_HASH, "9000000002");
        donor(DEMOTED, "Bývalý Správce", OLD_HASH, "9000000003");
        donor(PROMOTED, "Nový Správce", OLD_HASH, "9000000004");
        role(PROMOTED, "ADMIN");
        donor(UNCHANGED, "Stejný Dárce", OLD_HASH, "9000000005");
        donor(ONLY_BEFORE_THE_RESTORE, "Registrován Později", OLD_HASH, "9000000006");
        passkey(KEPT_PASSKEY, NEW_PASSWORD, "kept");
        passkey(ADDED_PASSKEY, NEW_PASSWORD, "added");
        secondFactor(NEW_PASSWORD, "MFRGGZDFMZTWQ2LK");
        secondFactor(UNCHANGED, "KRSXG5DSNFXGO2LT");
        adminAction(TRAIL_IN_BOTH, "GRANT_ADMINISTRATION", "2026-11-01T08:00:00Z");
        adminAction(TRAIL_AFTER_THE_DUMP, "ERASE_DONOR", "2026-11-02T08:00:00Z");
        adminAction(TRAIL_OF_THE_RESTORE_REQUEST, "RESTORE_BACKUP", "2026-11-03T08:00:00Z");
        readFactsOfThisDatabase();
        statements.execute("""
                update donor set erased_at = null, name = 'Vymazaná Dárkyně', password_hash = '%2$s' where id = '%1$s'::uuid;
                insert into donor_role (donor_id, role) values ('%1$s'::uuid, 'DONOR');
                update donor set password_hash = '%2$s' where id = '%3$s'::uuid;
                delete from donor_passkey where id = '%4$s'::uuid;
                insert into donor_passkey (id, donor_id, credential_id, credential_data, sign_count, transports, name, created_at)
                  values ('%5$s'::uuid, '%3$s'::uuid, 'removed', '\\x00', 0, 'internal', 'removed', now());
                update donor_second_factor set secret = 'JBSWY3DPEHPK3PXP', confirmed_at = null where donor_id = '%3$s'::uuid;
                insert into donor_role (donor_id, role) values ('%6$s'::uuid, 'ADMIN');
                delete from donor_role where donor_id = '%7$s'::uuid and role = 'ADMIN';
                delete from donor where id = '%8$s'::uuid;
                """.formatted(ERASED, OLD_HASH, NEW_PASSWORD, ADDED_PASSKEY, REMOVED_PASSKEY, DEMOTED, PROMOTED, ONLY_BEFORE_THE_RESTORE));
        forgetTrail(TRAIL_AFTER_THE_DUMP, TRAIL_OF_THE_RESTORE_REQUEST);

        String counts = carryForward();

        assertThat(counts).isEqualTo("1 1 2 2 1000");
        assertThat(text("select (erased_at is not null)::text from donor where id = '" + ERASED + "'::uuid")).isEqualTo("true");
        assertThat(text("select coalesce(password_hash, 'none') from donor where id = '" + ERASED + "'::uuid")).isEqualTo("none");
        assertThat(roles(ERASED)).isEmpty();
        assertThat(text("select name from donor where id = '" + ERASED + "'::uuid")).isEqualTo("Vymazaná Dárkyně");
        assertThat(text("select password_hash from donor where id = '" + NEW_PASSWORD + "'::uuid")).isEqualTo(NEW_HASH);
        assertThat(jdbc.sql("select id::text from donor_passkey where donor_id = ?::uuid order by id").param(NEW_PASSWORD).query(String.class).list())
                .containsExactly(KEPT_PASSKEY, ADDED_PASSKEY);
        assertThat(text("select encode(credential_data, 'hex') || ' ' || sign_count || ' ' || name from donor_passkey where id = '" + ADDED_PASSKEY + "'::uuid"))
                .isEqualTo("00ff 7 added");
        assertThat(text("select secret || ' ' || (confirmed_at is not null) from donor_second_factor where donor_id = '" + NEW_PASSWORD + "'::uuid"))
                .isEqualTo("MFRGGZDFMZTWQ2LK true");
        assertThat(text("select secret from donor_second_factor where donor_id = '" + UNCHANGED + "'::uuid")).isEqualTo("KRSXG5DSNFXGO2LT");
        assertThat(roles(DEMOTED)).containsExactly("DONOR");
        assertThat(roles(PROMOTED)).containsExactly("ADMIN", "DONOR");
        assertThat(roles(UNCHANGED)).containsExactly("DONOR");
        assertThat(text("select count(*) from donor where id = '" + ONLY_BEFORE_THE_RESTORE + "'::uuid")).isEqualTo("0");
        assertThat(jdbc.sql("select id::text || ' ' || action || ' ' || performed_at from admin_action order by performed_at").query(String.class).list())
                .containsExactly(TRAIL_IN_BOTH + " GRANT_ADMINISTRATION 2026-11-01 08:00:00+00",
                        TRAIL_AFTER_THE_DUMP + " ERASE_DONOR 2026-11-02 08:00:00+00",
                        TRAIL_OF_THE_RESTORE_REQUEST + " RESTORE_BACKUP 2026-11-03 08:00:00+00");
        assertThat(text("select client from admin_action where id = '" + TRAIL_AFTER_THE_DUMP + "'::uuid")).isEqualTo("https://client.example/metadata.json");
    }

    @Test
    @DisplayName("Given a database that issued receipts, when the restored copy carries its facts forward, then the receipt numbers stay where the restore put them")
    void should_leave_receipt_numbers_when_carried_forward_given_receipts_were_issued() {
        statements.execute("select setval('donation_receipt_number_seq', 41)");
        issuedReceipt();
        readFactsOfThisDatabase();

        String counts = carryForward();

        assertThat(counts).isEqualTo("0 0 0 0 0");
        assertThat(text("select last_value || ' ' || is_called from donation_receipt_number_seq")).isEqualTo("41 true");
    }

    @Test
    @DisplayName("Given a database without issued receipts, as a new server restoring the last dump of a lost one, when the restored copy carries its facts forward, then the next receipt number moves 1000 further, whether a number was taken or not")
    void should_skip_a_thousand_receipt_numbers_when_carried_forward_given_no_issued_receipt() {
        readFactsOfThisDatabase();
        statements.execute("select setval('donation_receipt_number_seq', 41)");

        assertThat(carryForward()).endsWith(" 1000");
        assertThat(text("select nextval('donation_receipt_number_seq')")).isEqualTo("1042");

        statements.execute("select setval('donation_receipt_number_seq', 1, false)");
        assertThat(carryForward()).endsWith(" 1000");
        assertThat(text("select nextval('donation_receipt_number_seq')")).isEqualTo("1001");
    }

    @Test
    @DisplayName("Given an empty database before the restore, as a server that never started, when its facts are read and carried forward, then only the receipt numbers move")
    void should_move_only_receipt_numbers_when_carried_forward_given_an_empty_database_before() {
        statements.execute("alter table donor rename to donor_hidden");
        statements.execute("alter table donor_role rename to donor_role_hidden");
        statements.execute("alter table donor_passkey rename to donor_passkey_hidden");
        statements.execute("alter table donor_second_factor rename to donor_second_factor_hidden");
        statements.execute("alter table admin_action rename to admin_action_hidden");
        statements.execute("alter table issued_receipt rename to issued_receipt_hidden");
        readFactsOfThisDatabase();
        statements.execute("alter table donor_hidden rename to donor");
        statements.execute("alter table donor_role_hidden rename to donor_role");
        statements.execute("alter table donor_passkey_hidden rename to donor_passkey");
        statements.execute("alter table donor_second_factor_hidden rename to donor_second_factor");
        statements.execute("alter table admin_action_hidden rename to admin_action");
        statements.execute("alter table issued_receipt_hidden rename to issued_receipt");
        donor(UNCHANGED, "Stejný Dárce", OLD_HASH, "9000000005");

        assertThat(text("select string_agg(kind, ' ' order by kind) from read_facts")).isEqualTo("end issued_receipts");
        assertThat(carryForward()).isEqualTo("0 0 0 0 1000");
        assertThat(text("select password_hash from donor where id = '" + UNCHANGED + "'::uuid")).isEqualTo(OLD_HASH);
    }

    @Test
    @DisplayName("Given facts that arrived cut short, when they are carried forward, then the restore is refused and nothing in the copy changes")
    void should_refuse_when_carried_forward_given_facts_cut_short() {
        donor(NEW_PASSWORD, "Změněné Heslo", NEW_HASH, "9000000002");
        readFactsOfThisDatabase();
        statements.execute("update donor set password_hash = '" + OLD_HASH + "' where id = '" + NEW_PASSWORD + "'::uuid");
        statements.execute("delete from read_facts where kind = 'donor'");

        assertThat(refusal()).contains("arrived incomplete");
        statements.execute("insert into read_facts select carried_kind, carried_fact from pg_temp.facts_to_carry_forward() where carried_kind = 'donor'");
        statements.execute("delete from read_facts where kind = 'end'");
        assertThat(refusal()).contains("arrived incomplete");
        assertThat(text("select password_hash from donor where id = '" + NEW_PASSWORD + "'::uuid")).isEqualTo(OLD_HASH);
    }

    @Test
    @DisplayName("Given a dump from before the audit trail named the client, when entries written since are carried forward, then they come without that column and the rest of each is kept")
    void should_carry_entries_without_the_missing_column_when_carried_forward_given_an_older_dump() {
        adminAction(TRAIL_AFTER_THE_DUMP, "ERASE_DONOR", "2026-11-02T08:00:00Z");
        readFactsOfThisDatabase();
        forgetTrail(TRAIL_AFTER_THE_DUMP);
        statements.execute("alter table admin_action drop column client");

        assertThat(carryForward()).startsWith("0 0 0 1 ");
        assertThat(text("select action || ' ' || details from admin_action where id = '" + TRAIL_AFTER_THE_DUMP + "'::uuid"))
                .isEqualTo("ERASE_DONOR carried forward");
    }

    @Test
    @DisplayName("Given a dump from before passkeys and a donor who added one since, when the facts are carried forward, then the restore is refused rather than leaving the passkey behind")
    void should_refuse_when_carried_forward_given_a_dump_without_the_passkey_table() {
        donor(NEW_PASSWORD, "Změněné Heslo", OLD_HASH, "9000000002");
        passkey(ADDED_PASSKEY, NEW_PASSWORD, "added");
        readFactsOfThisDatabase();
        statements.execute("drop table donor_passkey");

        assertThat(refusal()).contains("has no table donor_passkey");
    }

    private void readFactsOfThisDatabase() {
        statements.execute("insert into read_facts select carried_kind, carried_fact from pg_temp.facts_to_carry_forward()");
    }

    private String carryForward() {
        statements.execute("delete from carried");
        statements.execute("insert into carried select kind, fact from read_facts");
        return text("select pg_temp.carry_forward()");
    }

    private String refusal() {
        statements.execute("savepoint before_the_carry");
        try {
            carryForward();
            throw new AssertionError("the carry forward was not refused");
        } catch (UncategorizedSQLException refused) {
            statements.execute("rollback to savepoint before_the_carry");
            return refused.getMessage();
        }
    }

    private String text(String sql) {
        return jdbc.sql(sql).query(String.class).single();
    }

    private List<String> roles(String donor) {
        return jdbc.sql("select role from donor_role where donor_id = ?::uuid order by role").param(donor).query(String.class).list();
    }

    private void donor(String id, String name, String hash, String symbol) {
        jdbc.sql("""
                insert into donor (id, type, name, street, city, postal_code, email, password_hash, variable_symbol, preferred_locale, registered_at, email_verified_at)
                values (?::uuid, 'PERSON', ?, 'Ulice 1', 'Město', '110 00', ?, ?, ?, 'cs', now(), now())
                """).params(id, name, symbol + "@example.cz", hash, symbol).update();
        role(id, "DONOR");
    }

    private void role(String donor, String role) {
        jdbc.sql("insert into donor_role (donor_id, role) values (?::uuid, ?)").params(donor, role).update();
    }

    private void passkey(String id, String donor, String name) {
        jdbc.sql("""
                insert into donor_passkey (id, donor_id, credential_id, credential_data, sign_count, transports, name, created_at, relying_party_id)
                values (?::uuid, ?::uuid, ?, '\\x00ff', 7, 'internal', ?, now(), 'nfnn.cz')
                """).params(id, donor, name, name).update();
    }

    private void secondFactor(String donor, String secret) {
        jdbc.sql("insert into donor_second_factor (donor_id, secret, created_at, confirmed_at, last_used_step) values (?::uuid, ?, now(), now(), 59000000)")
                .params(donor, secret).update();
    }

    private void adminAction(String id, String action, String performedAt) {
        jdbc.sql("""
                insert into admin_action (id, admin_id, action, subject_id, details, performed_at, client)
                values (?::uuid, '019a0000-0000-7000-8000-000000000002'::uuid, ?, null, 'carried forward', ?::timestamptz, 'https://client.example/metadata.json')
                """).params(id, action, performedAt).update();
    }

    private void forgetTrail(String... ids) {
        statements.execute("select pg_advisory_xact_lock(" + AUDIT_TRAIL_LOCK + ")");
        for (String id : ids) {
            jdbc.sql("delete from admin_action where id = ?::uuid").param(id).update();
        }
    }

    private void issuedReceipt() {
        statements.execute("set local session_replication_role = replica");
        statements.execute("""
                insert into issued_receipt (id, donor_id, kind, donation_id, receipt_year, number, issued_on, issued_at, locale, fingerprint,
                                            status, schema_version, frozen, signature_image_sha256, signing_key_id, proof, status_sha256)
                values ('019a0000-0000-7000-8000-0000000000d1', '019a0000-0000-7000-8000-0000000000d2', 'SINGLE', '019a0000-0000-7000-8000-0000000000d3',
                        null, '2026-000041', '2026-11-01', now(), 'cs', repeat('5', 64), 'ACTIVE', 1, '{}', null, '0a1b2c3d', decode(repeat('cd', 65), 'hex'),
                        repeat('6', 64))
                """);
        statements.execute("set local session_replication_role = origin");
    }
}
