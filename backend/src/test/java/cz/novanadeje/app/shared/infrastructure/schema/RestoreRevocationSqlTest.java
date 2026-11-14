package cz.novanadeje.app.shared.infrastructure.schema;

import cz.novanadeje.app.PersistenceTest;
import cz.novanadeje.app.sharedcases.SharedCases;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

@PersistenceTest
class RestoreRevocationSqlTest {

    private static final Path REVOCATIONS = Path.of("deploy", "backup", "revoke-restored-credentials.sql");

    private static final List<String> ENDED_AS_SESSIONS = List.of("donor_refresh_token", "donor_device", "operations_push_subscription",
            "operations_donor_push_subscription");

    private static final Map<String, String> KEPT_USABLE_AFTER_A_RESTORE = Map.of(
            "donor_second_factor_recovery", "the 1 Kč recovery unlocks nothing without a payment from the donor's verified account, and a payment made between"
                    + " the dump and the restore is imported again and must still complete it (plan v3 2.34, Jakub's card)");

    private static final Set<String> HOLD_NO_SESSION_OR_ONE_TIME_SECRET = Set.of(
            "admin_action", "backup_alert_state", "bank_code", "bank_code_list_state", "bank_import_state", "bank_logo", "bank_logo_image", "bank_payment", "contact_message",
            "content_about", "content_donate_band", "content_former_slug", "content_founders_note", "content_media", "content_media_variant", "content_news",
            "content_people_footnote", "content_person", "content_project", "content_project_order",
            "donation", "donation_import_alert", "donation_monthly_report", "donation_person_receipt_signature", "donation_receipt_signatory",
            "donation_receipt_signature", "donation_report_delivery", "donation_report_settings", "donor_record", "donor_sender_account", "donor_symbol_claim",
            "issued_receipt", "receipt_image", "receipt_signing_key", "receipt_signing_key_adoption",
            "donor", "donor_passkey", "donor_registration_reminder", "donor_role", "donor_second_factor", "donor_second_factor_wrong_codes",
            "operations_alert", "operations_backup_key_confirmation", "operations_backup_schedule", "operations_carried_settings_key",
            "operations_push_key", "operations_restore_record", "operations_setting", "operations_setup");

    private static final Pattern SPENT_TABLES = Pattern.compile("foreach one_time_table in array array\\[(?<tables>[^]]*)]");
    private static final Pattern END_SESSIONS = Pattern.compile("function pg_temp\\.end_sessions\\(\\).*?\\$\\$(?<body>.*?)\\$\\$", Pattern.DOTALL);
    private static final String DONOR = "019a0000-0000-7000-8000-0000000000d1";
    private static final String DEVICE = "019a0000-0000-7000-8000-0000000000d2";
    private static final String SIGNED_OUT_DEVICE = "019a0000-0000-7000-8000-0000000000d3";
    private static final String REVOKED_TOKEN = "019a0000-0000-7000-8000-0000000000e6";
    private static final OffsetDateTime USED_BEFORE_THE_DUMP = OffsetDateTime.parse("2026-11-01T08:00:00Z");

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private JdbcTemplate statements;

    @BeforeEach
    void loadTheRevocationsIntoThisSession() throws IOException {
        statements.execute(revocations());
        endSessions();
        spendOneTimeSecrets();
        jdbc.sql("""
                insert into donor (id, type, name, street, city, postal_code, email, password_hash, variable_symbol, preferred_locale, registered_at,
                                   email_verified_at)
                values (?::uuid, 'PERSON', 'Obnovený Dárce', 'Ulice 1', 'Město', '110 00', 'obnoveny@example.cz', null, '9000000001', 'cs', now(), now())
                """).param(DONOR).update();
        jdbc.sql("insert into donor_device (id, donor_id, platform, browser, signed_in_at, last_used_at) values (?::uuid, ?::uuid, 'IPHONE', 'SAFARI', now(), now())")
                .params(DEVICE, DONOR).update();
    }

    @Test
    @DisplayName("Given a restored copy with a live browser session, a connected application, a rotated token, an expired one, an administrator's and a donor's push subscription and a device and token that ended before, when the sessions end, then every refresh token is revoked, every active device ends as expired, both push subscriptions go, what ended before keeps its end and only the two live sessions are counted")
    void should_revoke_every_refresh_token_and_end_every_device_when_sessions_end_given_restored_copy() {
        refreshToken("019a0000-0000-7000-8000-0000000000e1", "now() + interval '14 days'", "null", DEVICE, "null");
        refreshToken("019a0000-0000-7000-8000-0000000000e2", "now() + interval '14 days'", "null", null, "'https://claude.ai/.well-known/oauth-client'");
        refreshToken("019a0000-0000-7000-8000-0000000000e3", "now() + interval '14 days'", "now() - interval '1 hour'", DEVICE, "null");
        refreshToken("019a0000-0000-7000-8000-0000000000e4", "now() - interval '1 day'", "null", DEVICE, "null");
        jdbc.sql("insert into donor_device (id, donor_id, platform, browser, signed_in_at, last_used_at, ended_at, end_reason)"
                        + " values (?::uuid, ?::uuid, 'MAC', 'SAFARI', ?, ?, ?, 'SIGNED_OUT')")
                .params(SIGNED_OUT_DEVICE, DONOR, USED_BEFORE_THE_DUMP, USED_BEFORE_THE_DUMP, USED_BEFORE_THE_DUMP).update();
        refreshToken(REVOKED_TOKEN, "now() + interval '14 days'", "null", SIGNED_OUT_DEVICE, "null");
        jdbc.sql("update donor_refresh_token set revoked_at = ? where id = ?::uuid").params(USED_BEFORE_THE_DUMP, REVOKED_TOKEN).update();
        jdbc.sql("insert into operations_push_subscription (id, administrator_id, device_id, endpoint, p256dh, auth, created_at)"
                        + " values (gen_random_uuid(), ?::uuid, ?::uuid, 'https://web.push.apple.com/fictional', 'p256dh', 'auth', now())")
                .params(DONOR, DEVICE).update();
        jdbc.sql("insert into operations_donor_push_subscription (id, donor_id, device_id, endpoint, p256dh, auth, created_at)"
                        + " values (gen_random_uuid(), ?::uuid, ?::uuid, 'https://web.push.apple.com/fictional', 'p256dh', 'auth', now())")
                .params(DONOR, DEVICE).update();

        long ended = endSessions();

        assertThat(ended).isEqualTo(2);
        assertThat(count("select count(*) from donor_refresh_token where revoked_at is null")).isZero();
        assertThat(jdbc.sql("select end_reason from donor_device where id = ?::uuid").param(DEVICE).query(String.class).single()).isEqualTo("EXPIRED");
        assertThat(count("select count(*) from donor_device where ended_at is null")).isZero();
        assertThat(count("select count(*) from operations_push_subscription")).isZero();
        assertThat(count("select count(*) from operations_donor_push_subscription")).isZero();
        assertThat(count("select count(*) from donor_device where id = '" + SIGNED_OUT_DEVICE + "'::uuid and end_reason = 'SIGNED_OUT' and ended_at = '"
                + USED_BEFORE_THE_DUMP + "'::timestamptz")).isOne();
        assertThat(count("select count(*) from donor_refresh_token where id = '" + REVOKED_TOKEN + "'::uuid and revoked_at = '" + USED_BEFORE_THE_DUMP
                + "'::timestamptz")).isOne();
    }

    @Test
    @DisplayName("Given a restored copy with a valid, an expired and a used secret in every single-use table, when the one-time secrets are spent, then none is usable any more, a used one keeps the moment it was used, the valid ones are counted and the 1 Kč recovery stays open")
    void should_mark_every_one_time_secret_used_when_spent_given_restored_copy() {
        plantSecrets("now() + interval '1 hour'", "null", '1');
        plantSecrets("now() - interval '1 hour'", "null", '2');
        plantSecrets("now() + interval '1 hour'", "'" + USED_BEFORE_THE_DUMP + "'::timestamptz", '3');

        long spent = spendOneTimeSecrets();

        assertThat(spent).isEqualTo(spentTables().size());
        assertThat(spentTables()).allSatisfy(table -> {
            assertThat(count("select count(*) from " + table + " where used_at is null")).as(table).isZero();
            assertThat(count("select count(*) from " + table + " where used_at = '" + USED_BEFORE_THE_DUMP + "'::timestamptz")).as(table).isOne();
        });
        assertThat(count("select count(*) from donor_second_factor_recovery where used_at is null and donor_id = '" + DONOR + "'::uuid")).isEqualTo(2);
    }

    @Test
    @DisplayName("Given a dump from before refresh tokens kept their use, devices, push subscriptions and the reset links, when it is revoked, then the missing column and tables are passed over and the rest is revoked")
    void should_pass_over_missing_tables_when_revoked_given_an_older_dump() {
        refreshToken("019a0000-0000-7000-8000-0000000000e5", "now() + interval '14 days'", "null", null, "null");
        plantSecrets("now() + interval '1 hour'", "null", '4');
        statements.execute("alter table donor_refresh_token drop column used_at");
        statements.execute("drop table operations_push_subscription");
        statements.execute("drop table operations_donor_push_subscription");
        statements.execute("drop table donor_device cascade");
        statements.execute("drop table donor_password_reset_token");

        long ended = endSessions();
        long spent = spendOneTimeSecrets();

        assertThat(ended).isEqualTo(1);
        assertThat(spent).isEqualTo(spentTables().size() - 1);
        assertThat(count("select count(*) from donor_refresh_token where revoked_at is null")).isZero();
    }

    @Test
    @DisplayName("Given the migrated schema, when its tables are read, then each one is classified once, as a session the restore ends, a one-time secret it spends or keeps usable for a stated reason, or a table that holds neither, and none with an expiry or a hashed secret beside a use holds neither, so a new kind of session, link, challenge or code is not revived by a backup")
    void should_classify_every_table_once_when_tables_read_given_migrated_schema() {
        assertThat(classificationProblems()).isEmpty();
    }

    @Test
    @DisplayName("Given a new table that holds a session without an expiry, when the tables are read, then it is reported as unclassified")
    void should_report_the_table_as_unclassified_when_tables_read_given_a_new_session_table_without_an_expiry() {
        jdbc.sql("create table restore_probe_session (id uuid primary key, donor_id uuid not null, issued_at timestamp with time zone not null)").update();

        assertThat(classificationProblems()).containsExactly("restore_probe_session is not classified: a session goes into end_sessions and"
                + " ENDED_AS_SESSIONS, a one-time secret into spend_one_time_secrets or KEPT_USABLE_AFTER_A_RESTORE with its reason, any other table into"
                + " HOLD_NO_SESSION_OR_ONE_TIME_SECRET");
    }

    private List<String> classificationProblems() {
        List<String> tables = jdbc.sql("""
                select table_name from information_schema.tables
                where table_schema = 'public' and table_type = 'BASE TABLE' and table_name not like 'databasechangelog%'
                order by 1
                """).query(String.class).list();
        List<String> withAnExpiryOrAHashedSecretBesideAUse = jdbc.sql("""
                select distinct candidate.table_name from information_schema.columns candidate
                where candidate.table_schema = 'public'
                  and (candidate.column_name = 'expires_at'
                       or (candidate.column_name = 'used_at'
                           and exists (select 1 from information_schema.columns secret
                                       where secret.table_schema = 'public' and secret.table_name = candidate.table_name
                                         and secret.column_name like '%\\_hash')))
                order by 1
                """).query(String.class).list();
        Map<String, List<String>> classes = new LinkedHashMap<>();
        classes.put("spend_one_time_secrets", spentTables());
        classes.put("ENDED_AS_SESSIONS", ENDED_AS_SESSIONS);
        classes.put("KEPT_USABLE_AFTER_A_RESTORE", List.copyOf(KEPT_USABLE_AFTER_A_RESTORE.keySet()));
        classes.put("HOLD_NO_SESSION_OR_ONE_TIME_SECRET", List.copyOf(HOLD_NO_SESSION_OR_ONE_TIME_SECRET));
        List<String> problems = new ArrayList<>();
        for (String table : tables) {
            List<String> named = classes.entrySet().stream().filter(group -> group.getValue().contains(table)).map(Map.Entry::getKey).toList();
            if (named.isEmpty()) {
                problems.add(table + " is not classified: a session goes into end_sessions and ENDED_AS_SESSIONS, a one-time secret into"
                        + " spend_one_time_secrets or KEPT_USABLE_AFTER_A_RESTORE with its reason, any other table into HOLD_NO_SESSION_OR_ONE_TIME_SECRET");
            } else if (named.size() > 1) {
                problems.add(table + " is classified more than once, in " + named);
            }
        }
        classes.forEach((group, named) -> named.stream().filter(table -> !tables.contains(table)).sorted()
                .forEach(table -> problems.add(table + " in " + group + " is no table of the migrated schema")));
        String endSessions = endSessionsBody();
        ENDED_AS_SESSIONS.stream().filter(table -> !endSessions.contains("public." + table))
                .forEach(table -> problems.add(table + " is classified as a session, but end_sessions does not end it"));
        withAnExpiryOrAHashedSecretBesideAUse.stream().filter(HOLD_NO_SESSION_OR_ONE_TIME_SECRET::contains)
                .forEach(table -> problems.add(table + " has an expiry or a hashed secret beside a use, so it holds a session or a one-time secret"));
        return problems;
    }

    private String endSessionsBody() {
        Matcher function;
        try {
            function = END_SESSIONS.matcher(revocations());
        } catch (IOException unreadable) {
            throw new IllegalStateException(unreadable);
        }
        assertThat(function.find()).as("the function end_sessions in " + REVOCATIONS).isTrue();
        return function.group("body");
    }

    private List<String> spentTables() {
        Matcher listed;
        try {
            listed = SPENT_TABLES.matcher(revocations());
        } catch (IOException unreadable) {
            throw new IllegalStateException(unreadable);
        }
        assertThat(listed.find()).as("the list of spent tables in " + REVOCATIONS).isTrue();
        return Pattern.compile("'([a-z_]+)'").matcher(listed.group("tables")).results().map(table -> table.group(1)).toList();
    }

    private static String revocations() throws IOException {
        return Files.readString(SharedCases.repositoryRoot().resolve(REVOCATIONS), StandardCharsets.UTF_8);
    }

    private long count(String sql) {
        return jdbc.sql(sql).query(Long.class).single();
    }

    private long endSessions() {
        return count("select pg_temp.end_sessions()");
    }

    private long spendOneTimeSecrets() {
        return count("select pg_temp.spend_one_time_secrets()");
    }

    private void refreshToken(String id, String expiresAt, String usedAt, String device, String client) {
        jdbc.sql("insert into donor_refresh_token (id, donor_id, secret_hash, issued_at, granted_at, expires_at, used_at, device_id, client_id) values (?::uuid, ?::uuid, md5(?) || md5(?), now(), now(), "
                        + expiresAt + ", " + usedAt + ", ?::uuid, " + client + ")")
                .params(id, DONOR, id, "refresh", device).update();
    }

    private void plantSecrets(String expiresAt, String usedAt, char hash) {
        String secret = String.valueOf(hash).repeat(64);
        String times = "now(), " + expiresAt + ", " + usedAt;
        jdbc.sql("insert into donor_password_reset_token (id, donor_id, secret_hash, issued_at, expires_at, used_at) values (gen_random_uuid(), ?::uuid, ?, " + times + ")")
                .params(DONOR, secret).update();
        jdbc.sql("insert into donor_email_verification_token (id, donor_id, secret_hash, issued_at, expires_at, used_at) values (gen_random_uuid(), ?::uuid, ?, " + times + ")")
                .params(DONOR, secret).update();
        jdbc.sql("insert into donor_second_factor_challenge (id, donor_id, secret_hash, issued_at, expires_at, used_at) values (gen_random_uuid(), ?::uuid, ?, " + times + ")")
                .params(DONOR, secret).update();
        jdbc.sql("insert into donor_passkey_challenge (id, ceremony, donor_id, challenge_hash, issued_at, expires_at, used_at) values (gen_random_uuid(), 'SIGN_IN', null, ?, "
                        + times + ")")
                .param(secret).update();
        jdbc.sql("""
                insert into oauth_authorization_code (id, secret_hash, donor_id, client_id, redirect_uri, code_challenge, scope, resource, second_factor_verified,
                                                      issued_at, expires_at, used_at)
                values (gen_random_uuid(), ?, ?::uuid, 'https://client.example/metadata.json', 'https://client.example/callback', repeat('g', 43), 'admin:read',
                        'https://nfnn.cz/mcp', true,\s""" + times + ")")
                .params(secret, DONOR).update();
        jdbc.sql("insert into donor_second_factor_recovery (id, donor_id, code_hash, created_at, expires_at, used_at) values (gen_random_uuid(), ?::uuid, ?, " + times + ")")
                .params(DONOR, secret).update();
    }
}
