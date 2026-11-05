package cz.novanadeje.app.donors.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class RefreshTokenTest {

    private static final Instant NOW = Instant.parse("2026-10-17T10:00:00Z");
    private static final DonorId DONOR = DonorId.newId(NOW);

    @Test
    @DisplayName("Given a token neither expired nor revoked, when it is checked, then it is usable")
    void should_be_usable_when_checked_given_not_expired_and_not_revoked() {
        RefreshToken token = RefreshToken.issue(RefreshTokenSecret.generate(), DONOR, DeviceId.newId(NOW), NOW, Duration.ofDays(14), false);

        assertThat(token.isUsableAt(NOW.plus(Duration.ofDays(13)))).isTrue();
    }

    @Test
    @DisplayName("Given an expired token, when it is checked, then it is not usable")
    void should_not_be_usable_when_checked_given_expired() {
        RefreshToken token = RefreshToken.issue(RefreshTokenSecret.generate(), DONOR, DeviceId.newId(NOW), NOW, Duration.ofDays(14), false);

        assertThat(token.isUsableAt(NOW.plus(Duration.ofDays(14)))).isFalse();
    }

    @Test
    @DisplayName("Given a revoked token, when it is checked, then it is not usable")
    void should_not_be_usable_when_checked_given_revoked() {
        RefreshToken token = RefreshToken.issue(RefreshTokenSecret.generate(), DONOR, DeviceId.newId(NOW), NOW, Duration.ofDays(14), false);

        token.revoke(NOW.plusSeconds(10));

        assertThat(token.isRevoked()).isTrue();
        assertThat(token.isUsableAt(NOW.plusSeconds(20))).isFalse();
    }

    @Test
    @DisplayName("Given a rotation, when the token is marked used, then it is used but not revoked")
    void should_be_used_but_not_revoked_when_marked_used_given_rotation() {
        RefreshToken token = RefreshToken.issue(RefreshTokenSecret.generate(), DONOR, DeviceId.newId(NOW), NOW, Duration.ofDays(14), false);

        token.markUsed(NOW.plusSeconds(10));

        assertThat(token.isUsed()).isTrue();
        assertThat(token.usedAt()).contains(NOW.plusSeconds(10));
        assertThat(token.isRevoked()).isFalse();
        assertThat(token.isUsableAt(NOW.plusSeconds(20))).isFalse();
    }

    @Test
    @DisplayName("Given a sign-out or a password change, when the token is revoked, then it does not count as used")
    void should_not_count_as_used_when_revoked_given_sign_out_or_password_change() {
        RefreshToken token = RefreshToken.issue(RefreshTokenSecret.generate(), DONOR, DeviceId.newId(NOW), NOW, Duration.ofDays(14), false);

        token.revoke(NOW.plusSeconds(10));

        assertThat(token.isUsed()).isFalse();
        assertThat(token.usedAt()).isEmpty();
    }

    @Test
    @DisplayName("Given a secret, when a token is issued, then only its hash is stored")
    void should_store_only_hash_when_issued_given_secret() {
        RefreshTokenSecret secret = RefreshTokenSecret.generate();
        RefreshToken token = RefreshToken.issue(secret, DONOR, DeviceId.newId(NOW), NOW, Duration.ofDays(14), false);

        assertThat(token.secretHash()).isEqualTo(secret.hash());
        assertThat(token.secretHash()).isNotEqualTo(secret.value());
        assertThat(RefreshTokenSecret.fromValue(secret.value()).hash()).isEqualTo(secret.hash());
    }

    @Test
    @DisplayName("Given the browser, when a token is issued for it, then it belongs to no client")
    void should_belong_to_no_client_when_issued_for_the_browser() {
        RefreshToken token = RefreshToken.issue(RefreshTokenSecret.generate(), DONOR, DeviceId.newId(NOW), NOW, Duration.ofDays(14), false);

        assertThat(token.clientId()).isEmpty();
        assertThat(token.scopes()).isEmpty();
        assertThat(token.grantedAt()).isEqualTo(NOW);
    }

    @Test
    @DisplayName("Given a connected application, when a token is issued for it, then it keeps the client, the scopes and the grant time")
    void should_keep_the_client_scopes_and_grant_time_when_issued_for_a_connected_application() {
        ClientId client = new ClientId("https://claude.ai/.well-known/oauth-client");
        Instant granted = NOW.minus(Duration.ofDays(3));

        RefreshToken token = RefreshToken.issueForClient(RefreshTokenSecret.generate(), DONOR, client, Set.of(OAuthScope.ADMIN_READ),
                granted, NOW, Duration.ofDays(14));

        assertThat(token.clientId()).contains(client);
        assertThat(token.scopes()).containsExactly(OAuthScope.ADMIN_READ);
        assertThat(token.grantedAt()).isEqualTo(granted);
        assertThat(token.secondFactorVerified()).isTrue();
        assertThat(token.belongsToClient(client)).isTrue();
        assertThat(token.belongsToClient(new ClientId("https://claude.ai/oauth/claude-code-client-metadata"))).isFalse();
    }

    @Test
    @DisplayName("Given a browser token used with a successor, when it is presented again within 60 seconds of its use, then it may be reissued")
    void should_allow_reissue_when_presented_within_the_reuse_grace_given_a_used_browser_token_with_a_successor() {
        RefreshToken token = rotated(null, NOW.minusSeconds(59), null, UUID.randomUUID());

        assertThat(token.mayBeReissuedAt(NOW)).isTrue();
    }

    @Test
    @DisplayName("Given a browser token used with a successor, when it is presented 60 seconds or more after its use, then it may not be reissued")
    void should_refuse_reissue_when_presented_after_the_reuse_grace_given_a_used_browser_token_with_a_successor() {
        RefreshToken token = rotated(null, NOW.minus(RefreshToken.REUSE_GRACE), null, UUID.randomUUID());

        assertThat(token.mayBeReissuedAt(NOW)).isFalse();
    }

    @Test
    @DisplayName("Given a used token whose sessions were all revoked, when it is presented within the grace, then it may not be reissued")
    void should_refuse_reissue_when_presented_within_the_grace_given_a_used_and_revoked_token() {
        RefreshToken token = rotated(null, NOW.minusSeconds(10), NOW.minusSeconds(5), UUID.randomUUID());

        assertThat(token.mayBeReissuedAt(NOW)).isFalse();
    }

    @Test
    @DisplayName("Given a used token without a recorded successor, when it is presented within the grace, then it may not be reissued")
    void should_refuse_reissue_when_presented_within_the_grace_given_no_recorded_successor() {
        RefreshToken token = rotated(null, NOW.minusSeconds(10), null, null);

        assertThat(token.mayBeReissuedAt(NOW)).isFalse();
    }

    @Test
    @DisplayName("Given a used token of a connected application, when it is presented within the grace, then it may not be reissued")
    void should_refuse_reissue_when_presented_within_the_grace_given_a_connected_application_token() {
        RefreshToken token = rotated(new ClientId("https://claude.ai/.well-known/oauth-client"), NOW.minusSeconds(10), null,
                UUID.randomUUID());

        assertThat(token.mayBeReissuedAt(NOW)).isFalse();
    }

    @Test
    @DisplayName("Given an unused token, when it is checked for the reuse grace, then it may not be reissued")
    void should_refuse_reissue_when_checked_given_an_unused_token() {
        RefreshToken token = RefreshToken.issue(RefreshTokenSecret.generate(), DONOR, DeviceId.newId(NOW.minusSeconds(10)), NOW.minusSeconds(10), Duration.ofDays(14), false);

        assertThat(token.mayBeReissuedAt(NOW)).isFalse();
    }

    @Test
    @DisplayName("Given a used token whose own lifetime ended, when it is presented within the grace, then it may not be reissued")
    void should_refuse_reissue_when_presented_within_the_grace_given_an_expired_token() {
        Instant issued = NOW.minus(Duration.ofDays(14));
        RefreshToken token = RefreshToken.reconstitute(UUID.randomUUID(), DONOR, RefreshTokenSecret.generate().hash(), issued, NOW, false, null,
                Set.of(), issued, NOW.minusSeconds(10), null, UUID.randomUUID(), null, null);

        assertThat(token.mayBeReissuedAt(NOW)).isFalse();
    }

    @Test
    @DisplayName("Given an unused token, when the grace supersedes it, then it is revoked and remembered as superseded")
    void should_revoke_and_mark_superseded_when_superseded_given_an_unused_token() {
        RefreshToken token = RefreshToken.issue(RefreshTokenSecret.generate(), DONOR, DeviceId.newId(NOW), NOW, Duration.ofDays(14), false);

        assertThat(token.isSuperseded()).isFalse();
        token.supersede(NOW.plusSeconds(10));

        assertThat(token.isSuperseded()).isTrue();
        assertThat(token.revokedAt()).contains(NOW.plusSeconds(10));
        assertThat(token.isUsableAt(NOW.plusSeconds(20))).isFalse();
    }

    private static RefreshToken rotated(ClientId client, Instant usedAt, Instant revokedAt, UUID successor) {
        Instant issued = usedAt.minus(Duration.ofDays(1));
        return RefreshToken.reconstitute(UUID.randomUUID(), DONOR, RefreshTokenSecret.generate().hash(), issued, issued.plus(Duration.ofDays(14)),
                false, client, Set.of(), issued, usedAt, revokedAt, successor, null, null);
    }
}
