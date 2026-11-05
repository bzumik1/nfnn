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
class RestoreRevocationsTest {

    static final Path REVOCATIONS = Path.of("deploy", "backup", "revoke-restored-credentials.sql");

    private static final String DONOR = "019a0000-0000-7000-8000-0000000000d1";
    private static final String DEVICE = "019a0000-0000-7000-8000-0000000000d2";

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private JdbcTemplate statements;

    @BeforeEach
    void loadTheRevocationsIntoThisSession() throws IOException {
        statements.execute(Files.readString(SharedCases.repositoryRoot().resolve(REVOCATIONS), StandardCharsets.UTF_8));
        endSessions();
        spendOneTimeSecrets();
        jdbc.sql("""
                insert into donor (id, type, name, street, city, postal_code, email, password_hash, variable_symbol, preferred_locale, registered_at,
                                   email_verified_at)
                values (?::uuid, 'PERSON', 'Obnovený Dárce', 'Ulice 1', 'Město', '110 00', 'obnoveny@example.cz', null, '9000000001', 'cs', now(), now())
                """).param(DONOR).update();
    }

    @Test
    @DisplayName("Given a restored copy with a live browser session, a connected application, a rotated token and an expired one, when the sessions end, then every refresh token is revoked, every device ends as expired and only the two live sessions are counted")
    void should_revoke_every_refresh_token_and_end_every_device_when_sessions_end_given_restored_copy() {
        jdbc.sql("insert into donor_device (id, donor_id, platform, browser, signed_in_at, last_used_at) values (?::uuid, ?::uuid, 'IPHONE', 'SAFARI', now(), now())")
                .params(DEVICE, DONOR).update();
        refreshToken("019a0000-0000-7000-8000-0000000000e1", "now() + interval '14 days'", "null", DEVICE, "null");
        refreshToken("019a0000-0000-7000-8000-0000000000e2", "now() + interval '14 days'", "null", null, "'https://claude.ai/.well-known/oauth-client'");
        refreshToken("019a0000-0000-7000-8000-0000000000e3", "now() + interval '14 days'", "now() - interval '1 hour'", DEVICE, "null");
        refreshToken("019a0000-0000-7000-8000-0000000000e4", "now() - interval '1 day'", "null", DEVICE, "null");

        long ended = endSessions();

        assertThat(ended).isEqualTo(2);
        assertThat(jdbc.sql("select count(*) from donor_refresh_token where revoked_at is null").query(Long.class).single()).isZero();
        assertThat(jdbc.sql("select end_reason from donor_device where id = ?::uuid").param(DEVICE).query(String.class).single()).isEqualTo("EXPIRED");
        assertThat(jdbc.sql("select count(*) from donor_device where ended_at is null").query(Long.class).single()).isZero();
    }

    @Test
    @DisplayName("Given a restored copy with an unused link, challenge or code in every single-use table, when the one-time secrets are spent, then none is usable any more and the ones still valid are counted")
    void should_mark_every_one_time_secret_used_when_spent_given_restored_copy() {
        plantSecrets("now() + interval '1 hour'", "null", '1');
        plantSecrets("now() - interval '1 hour'", "null", '2');
        plantSecrets("now() + interval '1 hour'", "now() - interval '1 minute'", '3');

        long spent = spendOneTimeSecrets();

        assertThat(spent).isEqualTo(oneTimeSecretTables().size());
        for (String table : oneTimeSecretTables()) {
            assertThat(jdbc.sql("select count(*) from " + table + " where used_at is null").query(Long.class).single()).as(table).isZero();
        }
    }

    @Test
    @DisplayName("Given the migrated schema, when the tables of single-use secrets are read, then the restore spends every one of them, so a new kind of link, challenge or code is not revived by a backup")
    void should_spend_every_single_use_table_when_tables_read_given_migrated_schema() throws IOException {
        String revocations = Files.readString(SharedCases.repositoryRoot().resolve(REVOCATIONS), StandardCharsets.UTF_8);

        assertThat(oneTimeSecretTables()).hasSize(6);
        assertThat(oneTimeSecretTables()).allSatisfy(table -> assertThat(revocations).contains("'" + table + "'"));
    }

    private List<String> oneTimeSecretTables() {
        return jdbc.sql("""
                select used.table_name from information_schema.columns used
                where used.table_schema = 'public' and used.column_name = 'used_at' and used.table_name <> 'donor_refresh_token'
                  and exists (select 1 from information_schema.columns secret
                              where secret.table_schema = 'public' and secret.table_name = used.table_name and secret.column_name like '%\\_hash')
                order by 1
                """).query(String.class).list();
    }

    private long endSessions() {
        return jdbc.sql("select pg_temp.end_sessions()").query(Long.class).single();
    }

    private long spendOneTimeSecrets() {
        return jdbc.sql("select pg_temp.spend_one_time_secrets()").query(Long.class).single();
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
