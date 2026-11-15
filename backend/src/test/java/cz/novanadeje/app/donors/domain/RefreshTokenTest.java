package cz.novanadeje.app.donors.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

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
        RefreshToken token = stored(null, NOW.plusSeconds(10), null);

        assertThat(token.isRevoked()).isTrue();
        assertThat(token.isUsableAt(NOW.plusSeconds(20))).isFalse();
    }

    @Test
    @DisplayName("Given a token its rotation used, when it is checked, then it is used but not revoked")
    void should_be_used_but_not_revoked_when_checked_given_a_token_its_rotation_used() {
        RefreshToken token = stored(NOW.plusSeconds(10), null, null);

        assertThat(token.isUsed()).isTrue();
        assertThat(token.usedAt()).contains(NOW.plusSeconds(10));
        assertThat(token.isRevoked()).isFalse();
        assertThat(token.isUsableAt(NOW.plusSeconds(20))).isFalse();
    }

    @Test
    @DisplayName("Given a token a sign-out or a password change revoked, when it is checked, then it does not count as used")
    void should_not_count_as_used_when_checked_given_a_token_a_sign_out_or_password_change_revoked() {
        RefreshToken token = stored(null, NOW.plusSeconds(10), null);

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
    @DisplayName("Given a used token of a connected application with a recorded successor, when it is presented within the grace, then it may be reissued")
    void should_allow_reissue_when_presented_within_the_grace_given_a_connected_application_token() {
        RefreshToken token = rotated(new ClientId("https://claude.ai/.well-known/oauth-client"), NOW.minusSeconds(10), null,
                UUID.randomUUID());

        assertThat(token.mayBeReissuedAt(NOW)).isTrue();
    }

    @Test
    @DisplayName("Given an unused token, when it is checked for the reuse grace, then it may not be reissued")
    void should_refuse_reissue_when_checked_given_an_unused_token() {
        RefreshToken token = RefreshToken.issue(RefreshTokenSecret.generate(), DONOR, DeviceId.newId(NOW.minusSeconds(10)), NOW.minusSeconds(10), Duration.ofDays(14), false);

        assertThat(token.mayBeReissuedAt(NOW)).isFalse();
    }

    @Test
    @DisplayName("Given a token used 59 seconds ago, when it is checked for the reuse grace, then it was used within the grace even when revoked and without a successor")
    void should_count_as_used_within_the_grace_when_checked_given_a_token_used_59_seconds_ago() {
        RefreshToken token = rotated(null, NOW.minusSeconds(59), NOW.minusSeconds(5), null);

        assertThat(token.wasUsedWithinReuseGraceAt(NOW)).isTrue();
    }

    @Test
    @DisplayName("Given a token used 60 seconds ago, when it is checked for the reuse grace, then it was not used within the grace")
    void should_not_count_as_used_within_the_grace_when_checked_given_a_token_used_60_seconds_ago() {
        RefreshToken token = rotated(null, NOW.minusSeconds(60), null, UUID.randomUUID());

        assertThat(token.wasUsedWithinReuseGraceAt(NOW)).isFalse();
    }

    @Test
    @DisplayName("Given an unused token, when it is checked for the reuse grace, then it was not used within the grace")
    void should_not_count_as_used_within_the_grace_when_checked_given_an_unused_token() {
        RefreshToken token = RefreshToken.issue(RefreshTokenSecret.generate(), DONOR, DeviceId.newId(NOW.minusSeconds(10)), NOW.minusSeconds(10), Duration.ofDays(14), false);

        assertThat(token.wasUsedWithinReuseGraceAt(NOW)).isFalse();
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
    @DisplayName("Given an unused token and one the grace superseded, when they are checked, then only the superseded one is revoked and remembered as superseded")
    void should_be_revoked_and_superseded_when_checked_given_a_token_the_grace_superseded() {
        RefreshToken unused = RefreshToken.issue(RefreshTokenSecret.generate(), DONOR, DeviceId.newId(NOW), NOW, Duration.ofDays(14), false);
        RefreshToken token = stored(null, NOW.plusSeconds(10), NOW.plusSeconds(10));

        assertThat(unused.isSuperseded()).isFalse();
        assertThat(token.isSuperseded()).isTrue();
        assertThat(token.revokedAt()).contains(NOW.plusSeconds(10));
        assertThat(token.isUsableAt(NOW.plusSeconds(20))).isFalse();
    }

    @Nested
    @DisplayName("Given the parts of a stored token")
    class GivenStoredParts {

        private static final UUID ID = UUID.randomUUID();
        private static final String HASH = RefreshTokenSecret.generate().hash();
        private static final Instant EXPIRES = NOW.plus(Duration.ofDays(14));
        private static final DeviceId DEVICE = DeviceId.newId(NOW);
        private static final ClientId CLIENT = new ClientId("https://claude.ai/.well-known/oauth-client");
        private static final Set<OAuthScope> SCOPES = Set.of(OAuthScope.ADMIN_READ);

        @Test
        @DisplayName("when its id or its donor is missing, then it is refused")
        void should_refuse_when_reconstituted_without_id_or_donor() {
            assertThatIllegalArgumentException().isThrownBy(() -> token(null, DONOR, HASH, NOW, EXPIRES, NOW, null, Set.of(), DEVICE));
            assertThatIllegalArgumentException().isThrownBy(() -> token(ID, null, HASH, NOW, EXPIRES, NOW, null, Set.of(), DEVICE));
        }

        @Test
        @DisplayName("when its secret's hash is missing or blank, then it is refused")
        void should_refuse_when_reconstituted_without_hash() {
            assertThatIllegalArgumentException().isThrownBy(() -> token(ID, DONOR, null, NOW, EXPIRES, NOW, null, Set.of(), DEVICE));
            assertThatIllegalArgumentException().isThrownBy(() -> token(ID, DONOR, " ", NOW, EXPIRES, NOW, null, Set.of(), DEVICE));
        }

        @Test
        @DisplayName("when its issue, expiry or grant time is missing, then it is refused")
        void should_refuse_when_reconstituted_without_a_time() {
            assertThatIllegalArgumentException().isThrownBy(() -> token(ID, DONOR, HASH, null, EXPIRES, NOW, null, Set.of(), DEVICE));
            assertThatIllegalArgumentException().isThrownBy(() -> token(ID, DONOR, HASH, NOW, null, NOW, null, Set.of(), DEVICE));
            assertThatIllegalArgumentException().isThrownBy(() -> token(ID, DONOR, HASH, NOW, EXPIRES, null, null, Set.of(), DEVICE));
        }

        @Test
        @DisplayName("when it expires at its issue or before it, then it is refused")
        void should_refuse_when_reconstituted_expiring_at_or_before_its_issue() {
            assertThatIllegalArgumentException().isThrownBy(() -> token(ID, DONOR, HASH, NOW, NOW, NOW, null, Set.of(), DEVICE));
            assertThatIllegalArgumentException().isThrownBy(() -> token(ID, DONOR, HASH, NOW, NOW.minusSeconds(1), NOW, null, Set.of(), DEVICE));
        }

        @Test
        @DisplayName("when it names both a device and a connected application, then it is refused")
        void should_refuse_when_reconstituted_with_device_and_client() {
            assertThatIllegalArgumentException().isThrownBy(() -> token(ID, DONOR, HASH, NOW, EXPIRES, NOW, CLIENT, SCOPES, DEVICE));
        }

        @Test
        @DisplayName("when it names a connected application without a scope, then it is refused")
        void should_refuse_when_reconstituted_with_client_without_scope() {
            assertThatIllegalArgumentException().isThrownBy(() -> token(ID, DONOR, HASH, NOW, EXPIRES, NOW, CLIENT, Set.of(), null));
        }

        @Test
        @DisplayName("when it names neither a device nor a connected application, as a browser token from before devices, then it is kept")
        void should_keep_when_reconstituted_without_device_and_client() {
            RefreshToken token = token(ID, DONOR, HASH, NOW, EXPIRES, NOW, null, Set.of(), null);

            assertThat(token.deviceId()).isEmpty();
            assertThat(token.clientId()).isEmpty();
        }

        @Test
        @DisplayName("when a connected application's token is issued without the application or a scope, then it is refused")
        void should_refuse_when_issued_for_a_client_without_the_client_or_a_scope() {
            assertThatIllegalArgumentException().isThrownBy(() -> RefreshToken.issueForClient(RefreshTokenSecret.generate(), DONOR, null, SCOPES, NOW,
                    NOW, Duration.ofDays(14)));
            assertThatIllegalArgumentException().isThrownBy(() -> RefreshToken.issueForClient(RefreshTokenSecret.generate(), DONOR, CLIENT, Set.of(),
                    NOW, NOW, Duration.ofDays(14)));
        }

        private static RefreshToken token(UUID id, DonorId donor, String hash, Instant issued, Instant expires, Instant granted, ClientId client,
                                          Set<OAuthScope> scopes, DeviceId device) {
            return RefreshToken.reconstitute(id, donor, hash, issued, expires, false, client, scopes, granted, null, null, null, null, device);
        }
    }

    private static RefreshToken stored(Instant usedAt, Instant revokedAt, Instant supersededAt) {
        return RefreshToken.reconstitute(UUID.randomUUID(), DONOR, RefreshTokenSecret.generate().hash(), NOW, NOW.plus(Duration.ofDays(14)), false,
                null, Set.of(), NOW, usedAt, revokedAt, null, supersededAt, DeviceId.newId(NOW));
    }

    private static RefreshToken rotated(ClientId client, Instant usedAt, Instant revokedAt, UUID successor) {
        Instant issued = usedAt.minus(Duration.ofDays(1));
        return RefreshToken.reconstitute(UUID.randomUUID(), DONOR, RefreshTokenSecret.generate().hash(), issued, issued.plus(Duration.ofDays(14)),
                false, client, client == null ? Set.of() : Set.of(OAuthScope.ADMIN_READ), issued, usedAt, revokedAt, successor, null, null);
    }
}
