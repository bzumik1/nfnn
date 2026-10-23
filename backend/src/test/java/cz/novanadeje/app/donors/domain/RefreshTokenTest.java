package cz.novanadeje.app.donors.domain;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class RefreshTokenTest {

    private static final Instant NOW = Instant.parse("2026-10-17T10:00:00Z");
    private static final DonorId DONOR = DonorId.newId(NOW);

    @Test
    void should_be_usable_when_checked_given_not_expired_and_not_revoked() {
        RefreshToken token = RefreshToken.issue(RefreshTokenSecret.generate(), DONOR, NOW, Duration.ofDays(14), false);

        assertThat(token.isUsableAt(NOW.plus(Duration.ofDays(13)))).isTrue();
    }

    @Test
    void should_not_be_usable_when_checked_given_expired() {
        RefreshToken token = RefreshToken.issue(RefreshTokenSecret.generate(), DONOR, NOW, Duration.ofDays(14), false);

        assertThat(token.isUsableAt(NOW.plus(Duration.ofDays(14)))).isFalse();
    }

    @Test
    void should_not_be_usable_when_checked_given_revoked() {
        RefreshToken token = RefreshToken.issue(RefreshTokenSecret.generate(), DONOR, NOW, Duration.ofDays(14), false);

        token.revoke(NOW.plusSeconds(10));

        assertThat(token.isRevoked()).isTrue();
        assertThat(token.isUsableAt(NOW.plusSeconds(20))).isFalse();
    }

    @Test
    void should_store_only_hash_when_issued_given_secret() {
        RefreshTokenSecret secret = RefreshTokenSecret.generate();
        RefreshToken token = RefreshToken.issue(secret, DONOR, NOW, Duration.ofDays(14), false);

        assertThat(token.secretHash()).isEqualTo(secret.hash());
        assertThat(token.secretHash()).isNotEqualTo(secret.value());
        assertThat(RefreshTokenSecret.fromValue(secret.value()).hash()).isEqualTo(secret.hash());
    }

    @Test
    void should_belong_to_no_client_when_issued_for_the_browser() {
        RefreshToken token = RefreshToken.issue(RefreshTokenSecret.generate(), DONOR, NOW, Duration.ofDays(14), false);

        assertThat(token.clientId()).isEmpty();
        assertThat(token.scopes()).isEmpty();
        assertThat(token.grantedAt()).isEqualTo(NOW);
    }

    @Test
    void should_keep_the_client_scopes_and_grant_time_when_issued_for_a_connected_application() {
        ClientId client = new ClientId("https://claude.ai/.well-known/oauth-client");
        Instant granted = NOW.minus(Duration.ofDays(3));

        RefreshToken token = RefreshToken.issueForClient(RefreshTokenSecret.generate(), DONOR, client, java.util.Set.of(OAuthScope.ADMIN_READ),
                granted, NOW, Duration.ofDays(14));

        assertThat(token.clientId()).contains(client);
        assertThat(token.scopes()).containsExactly(OAuthScope.ADMIN_READ);
        assertThat(token.grantedAt()).isEqualTo(granted);
        assertThat(token.secondFactorVerified()).isTrue();
        assertThat(token.belongsToClient(client)).isTrue();
        assertThat(token.belongsToClient(new ClientId("https://claude.ai/oauth/claude-code-client-metadata"))).isFalse();
    }
}
