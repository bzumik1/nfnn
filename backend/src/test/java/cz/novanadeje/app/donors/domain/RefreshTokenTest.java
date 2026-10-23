package cz.novanadeje.app.donors.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class RefreshTokenTest {

    private static final Instant NOW = Instant.parse("2026-10-17T10:00:00Z");
    private static final DonorId DONOR = DonorId.newId(NOW);

    @Test
    @DisplayName("Given a token neither expired nor revoked, when it is checked, then it is usable")
    void should_be_usable_when_checked_given_not_expired_and_not_revoked() {
        RefreshToken token = RefreshToken.issue(RefreshTokenSecret.generate(), DONOR, NOW, Duration.ofDays(14), false);

        assertThat(token.isUsableAt(NOW.plus(Duration.ofDays(13)))).isTrue();
    }

    @Test
    @DisplayName("Given an expired token, when it is checked, then it is not usable")
    void should_not_be_usable_when_checked_given_expired() {
        RefreshToken token = RefreshToken.issue(RefreshTokenSecret.generate(), DONOR, NOW, Duration.ofDays(14), false);

        assertThat(token.isUsableAt(NOW.plus(Duration.ofDays(14)))).isFalse();
    }

    @Test
    @DisplayName("Given a revoked token, when it is checked, then it is not usable")
    void should_not_be_usable_when_checked_given_revoked() {
        RefreshToken token = RefreshToken.issue(RefreshTokenSecret.generate(), DONOR, NOW, Duration.ofDays(14), false);

        token.revoke(NOW.plusSeconds(10));

        assertThat(token.isRevoked()).isTrue();
        assertThat(token.isUsableAt(NOW.plusSeconds(20))).isFalse();
    }

    @Test
    @DisplayName("Given a rotation, when the token is marked used, then it is used but not revoked")
    void should_be_used_but_not_revoked_when_marked_used_given_rotation() {
        RefreshToken token = RefreshToken.issue(RefreshTokenSecret.generate(), DONOR, NOW, Duration.ofDays(14), false);

        token.markUsed(NOW.plusSeconds(10));

        assertThat(token.isUsed()).isTrue();
        assertThat(token.usedAt()).contains(NOW.plusSeconds(10));
        assertThat(token.isRevoked()).isFalse();
        assertThat(token.isUsableAt(NOW.plusSeconds(20))).isFalse();
    }

    @Test
    @DisplayName("Given a sign-out or a password change, when the token is revoked, then it does not count as used")
    void should_not_count_as_used_when_revoked_given_sign_out_or_password_change() {
        RefreshToken token = RefreshToken.issue(RefreshTokenSecret.generate(), DONOR, NOW, Duration.ofDays(14), false);

        token.revoke(NOW.plusSeconds(10));

        assertThat(token.isUsed()).isFalse();
        assertThat(token.usedAt()).isEmpty();
    }

    @Test
    @DisplayName("Given a secret, when a token is issued, then only its hash is stored")
    void should_store_only_hash_when_issued_given_secret() {
        RefreshTokenSecret secret = RefreshTokenSecret.generate();
        RefreshToken token = RefreshToken.issue(secret, DONOR, NOW, Duration.ofDays(14), false);

        assertThat(token.secretHash()).isEqualTo(secret.hash());
        assertThat(token.secretHash()).isNotEqualTo(secret.value());
        assertThat(RefreshTokenSecret.fromValue(secret.value()).hash()).isEqualTo(secret.hash());
    }

    @Test
    @DisplayName("Given the browser, when a token is issued for it, then it belongs to no client")
    void should_belong_to_no_client_when_issued_for_the_browser() {
        RefreshToken token = RefreshToken.issue(RefreshTokenSecret.generate(), DONOR, NOW, Duration.ofDays(14), false);

        assertThat(token.clientId()).isEmpty();
        assertThat(token.scopes()).isEmpty();
        assertThat(token.grantedAt()).isEqualTo(NOW);
    }

    @Test
    @DisplayName("Given a connected application, when a token is issued for it, then it keeps the client, the scopes and the grant time")
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
