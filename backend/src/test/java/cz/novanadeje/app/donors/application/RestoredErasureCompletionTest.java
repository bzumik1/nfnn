package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.support.DatabaseCleaner;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import static org.assertj.core.api.Assertions.assertThat;

@IntegrationTest
class RestoredErasureCompletionTest {

    private static final String BROUGHT_BACK = "019a0000-0000-7000-8000-0000000000e1";
    private static final String KEPT = "019a0000-0000-7000-8000-0000000000e2";
    private static final String ERASED_AT = "2026-11-03T08:00:00Z";

    @Autowired
    private RestoredErasures restoredErasures;
    @Autowired
    private JdbcClient jdbc;

    @BeforeEach
    void aRestoreBroughtBackTheDataOfAnErasedDonor() {
        new DatabaseCleaner(jdbc).emptyAllTables();
        donor(BROUGHT_BACK, "Vrácená Dárkyně", "9000000011", ERASED_AT);
        donor(KEPT, "Zůstávající Dárce", "9000000012", null);
        for (String donor : new String[] {BROUGHT_BACK, KEPT}) {
            jdbc.sql("""
                    insert into donor_record (donor_id, type, name, street, city, postal_code, variable_symbol, preferred_locale, registered_at, updated_at)
                    select id, type, name, street, city, postal_code, variable_symbol, preferred_locale, registered_at, registered_at from donor where id = ?::uuid
                    """).param(donor).update();
            jdbc.sql("""
                    insert into donor_passkey (id, donor_id, credential_id, credential_data, sign_count, transports, name, created_at)
                    values (gen_random_uuid(), ?::uuid, ?, '\\x00', 0, 'internal', 'Telefon', now())
                    """).params(donor, "credential-" + donor).update();
            jdbc.sql("insert into donor_device (id, donor_id, platform, browser, signed_in_at, last_used_at) values (gen_random_uuid(), ?::uuid, 'IPHONE', 'SAFARI', now(), now())")
                    .param(donor).update();
        }
        jdbc.sql("""
                insert into donor_sender_account (id, donor_id, account_number, bank_code, status, valid_from, created_at)
                values (gen_random_uuid(), ?::uuid, '123456789', '0100', 'AWAITING_PAYMENT', current_date, now())
                """).param(BROUGHT_BACK).update();
    }

    @Test
    @DisplayName("Given a donor that the restore carried forward as erased while the backup brought back the personal data, the donations copy, a passkey, a device and a bank account, when the backend has started, then the erasure is complete in both contexts with its first time, and an active donor keeps everything")
    void should_complete_the_erasure_in_both_contexts_when_started_given_a_donor_a_restore_brought_back() {
        restoredErasures.completeErasuresARestoreBroughtBack();
        restoredErasures.completeErasuresARestoreBroughtBack();

        assertThat(text("select name || ' ' || email || ' ' || coalesce(password_hash, 'none') || ' ' || erased_at from donor where id = ?::uuid", BROUGHT_BACK))
                .isEqualTo("Vymazaný dárce erased-" + BROUGHT_BACK + "@erased.invalid none 2026-11-03 08:00:00+00");
        assertThat(text("select count(*)::text from donor_role where donor_id = ?::uuid", BROUGHT_BACK)).isEqualTo("0");
        assertThat(text("select name || ' ' || erased_at from donor_record where donor_id = ?::uuid", BROUGHT_BACK)).isEqualTo("Vymazaný dárce 2026-11-03 08:00:00+00");
        assertThat(text("select count(*)::text from donor_sender_account where donor_id = ?::uuid", BROUGHT_BACK)).isEqualTo("0");
        assertThat(text("select count(*)::text from donor_passkey where donor_id = ?::uuid", BROUGHT_BACK)).isEqualTo("0");
        assertThat(text("select end_reason from donor_device where donor_id = ?::uuid", BROUGHT_BACK)).isEqualTo("ERASED");
        assertThat(text("select count(*)::text from admin_action where subject_id = ?::uuid", BROUGHT_BACK)).isEqualTo("0");

        assertThat(text("select name || ' ' || (erased_at is null)::text from donor where id = ?::uuid", KEPT)).isEqualTo("Zůstávající Dárce true");
        assertThat(text("select name || ' ' || (erased_at is null)::text from donor_record where donor_id = ?::uuid", KEPT)).isEqualTo("Zůstávající Dárce true");
        assertThat(text("select count(*)::text from donor_passkey where donor_id = ?::uuid", KEPT)).isEqualTo("1");
        assertThat(text("select coalesce(end_reason, 'active') from donor_device where donor_id = ?::uuid", KEPT)).isEqualTo("active");
    }

    private void donor(String id, String name, String symbol, String erasedAt) {
        jdbc.sql("""
                insert into donor (id, type, name, street, city, postal_code, email, password_hash, variable_symbol, preferred_locale, registered_at,
                                   email_verified_at, erased_at)
                values (?::uuid, 'PERSON', ?, 'Ulice 1', 'Město', '110 00', ?, null, ?, 'cs', now(), now(), ?::timestamptz)
                """).params(id, name, symbol + "@example.cz", symbol, erasedAt).update();
        if (erasedAt == null) {
            jdbc.sql("insert into donor_role (donor_id, role) values (?::uuid, 'DONOR')").param(id).update();
        }
    }

    private String text(String sql, String id) {
        return jdbc.sql(sql).param(id).query(String.class).single();
    }
}
