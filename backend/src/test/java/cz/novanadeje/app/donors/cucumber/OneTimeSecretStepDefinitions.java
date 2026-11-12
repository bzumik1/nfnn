package cz.novanadeje.app.donors.cucumber;

import cz.novanadeje.app.cucumber.ScenarioDonors;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import org.springframework.jdbc.core.simple.JdbcClient;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

public class OneTimeSecretStepDefinitions {

    private static final List<String> ONE_TIME_SECRET_TABLES = List.of("donor_second_factor_challenge", "donor_second_factor_recovery",
            "oauth_authorization_code");

    private final ScenarioDonors scenarioDonors;
    private final JdbcClient jdbc;
    private final Clock clock;
    private int planted;

    public OneTimeSecretStepDefinitions(ScenarioDonors scenarioDonors, JdbcClient jdbc, Clock clock) {
        this.scenarioDonors = scenarioDonors;
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Given("{string} and {string} each hold a second-factor challenge, a used and an open recovery by payment and a connection code")
    public void eachHoldASecondFactorChallengeRecoveriesAndAConnectionCode(String alias, String otherAlias) {
        plantOneTimeSecretsOf(scenarioDonors.idOf(alias));
        plantOneTimeSecretsOf(scenarioDonors.idOf(otherAlias));
    }

    @Then("{string} holds no second-factor challenge, recovery by payment or connection code any more, while {string} keeps hers")
    public void holdsNoOneTimeSecretAnyMoreWhileTheOtherKeepsHers(String alias, String otherAlias) {
        UUID erased = scenarioDonors.idOf(alias);
        UUID other = scenarioDonors.idOf(otherAlias);
        ONE_TIME_SECRET_TABLES.forEach(table -> {
            assertThat(countOf(table, erased)).as("%s of %s", table, alias).isZero();
            assertThat(countOf(table, other)).as("%s of %s", table, otherAlias).isPositive();
        });
    }

    private void plantOneTimeSecretsOf(UUID donor) {
        Instant now = clock.instant();
        Timestamp issued = Timestamp.from(now);
        Timestamp expires = Timestamp.from(now.plus(Duration.ofMinutes(5)));
        jdbc.sql("insert into donor_second_factor_challenge (id, donor_id, secret_hash, issued_at, expires_at) values (gen_random_uuid(), ?, ?, ?, ?)")
                .params(donor, hash('c'), issued, expires).update();
        jdbc.sql("insert into donor_second_factor_recovery (id, donor_id, code_hash, code, created_at, expires_at, used_at) values (gen_random_uuid(), ?, ?, null, ?, ?, ?)")
                .params(donor, hash('r'), issued, Timestamp.from(now.plus(Duration.ofDays(14))), issued).update();
        jdbc.sql("insert into donor_second_factor_recovery (id, donor_id, code_hash, created_at, expires_at) values (gen_random_uuid(), ?, ?, ?, ?)")
                .params(donor, hash('o'), issued, Timestamp.from(now.plus(Duration.ofDays(14)))).update();
        jdbc.sql("""
                insert into oauth_authorization_code (id, secret_hash, donor_id, client_id, redirect_uri, code_challenge, scope, resource, second_factor_verified,
                                                      issued_at, expires_at)
                values (gen_random_uuid(), ?, ?, 'https://client.example/metadata.json', 'https://client.example/callback', repeat('g', 43), 'admin:read',
                        'https://nfnn.cz/mcp', true, ?, ?)""")
                .params(hash('a'), donor, issued, expires).update();
    }

    private String hash(char kind) {
        planted++;
        return (kind + Integer.toString(planted)).repeat(64).substring(0, 64);
    }

    private long countOf(String table, UUID donor) {
        return jdbc.sql("select count(*) from " + table + " where donor_id = ?").param(donor).query(Long.class).single();
    }
}
