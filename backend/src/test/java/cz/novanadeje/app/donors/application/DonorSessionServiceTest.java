package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.InvalidRefreshToken;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.RefreshToken;
import cz.novanadeje.app.donors.domain.RefreshTokenRepository;
import cz.novanadeje.app.donors.domain.RefreshTokenSecret;
import cz.novanadeje.app.donors.domain.Role;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DonorSessionServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-17T10:00:00Z");
    private static final Duration REFRESH_TTL = Duration.ofDays(14);
    private static final DonorId DONOR = DonorId.newId(NOW);

    @Mock
    private RefreshTokenRepository refreshTokens;
    @Mock
    private DonorRepository donors;
    @Mock
    private AccessTokenIssuer accessTokens;

    private DonorSessionService service;

    @BeforeEach
    void setUp() {
        service = new DonorSessionService(refreshTokens, donors, accessTokens, new DonorSessionProperties(REFRESH_TTL), Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private static Donor donor() {
        return Donor.register(DONOR, DonorType.PERSON, "Jana Nováková", null, new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"),
                new EmailAddress("jana@example.cz"), new PasswordHash("$hash"), new VariableSymbol("1234567890"), LocaleCode.CS, NOW);
    }

    @Test
    @DisplayName("Given a donor, when a session opens, then an access token is issued and only the hash of the refresh token is stored")
    void should_issue_tokens_and_store_hash_when_session_opened() {
        when(accessTokens.issue(DONOR, Set.of(Role.DONOR), NOW)).thenReturn(new IssuedAccessToken("access", NOW.plus(Duration.ofMinutes(15))));

        IssuedTokens tokens = service.open(donor(), false);

        ArgumentCaptor<RefreshToken> stored = ArgumentCaptor.forClass(RefreshToken.class);
        verify(refreshTokens).save(stored.capture());
        assertThat(stored.getValue().secretHash()).isEqualTo(RefreshTokenSecret.fromValue(tokens.refreshToken()).hash());
        assertThat(stored.getValue().expiresAt()).isEqualTo(NOW.plus(REFRESH_TTL));
        assertThat(tokens.accessToken()).isEqualTo("access");
        assertThat(tokens.refreshTokenExpiresAt()).isEqualTo(NOW.plus(REFRESH_TTL));
    }

    @Test
    void should_use_up_old_and_issue_new_when_refreshed_given_usable_token() {
        RefreshTokenSecret secret = RefreshTokenSecret.generate();
        RefreshToken existing = RefreshToken.issue(secret, DONOR, NOW.minus(Duration.ofDays(1)), REFRESH_TTL, false);
        when(refreshTokens.findBySecretHash(secret.hash())).thenReturn(Optional.of(existing));
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor()));
        when(accessTokens.issue(eq(DONOR), eq(Set.of(Role.DONOR)), eq(NOW))).thenReturn(new IssuedAccessToken("access2", NOW.plus(Duration.ofMinutes(15))));
        when(refreshTokens.markUsed(existing.id(), NOW)).thenReturn(true);

        RefreshedSession refreshed = service.refresh(secret.value());

        verify(refreshTokens).markUsed(existing.id(), NOW);
        verify(refreshTokens, never()).revokeAllOf(any(), any());
        assertThat(refreshed.donor().id()).isEqualTo(DONOR);
        assertThat(refreshed.tokens().refreshToken()).isNotEqualTo(secret.value());
    }

    @Test
    @DisplayName("Given a refresh token another request uses at the same moment, when it is refreshed, then every session of the donor ends")
    void should_revoke_every_session_when_refreshed_given_token_used_concurrently() {
        RefreshTokenSecret secret = RefreshTokenSecret.generate();
        RefreshToken existing = RefreshToken.issue(secret, DONOR, NOW.minus(Duration.ofDays(1)), REFRESH_TTL, false);
        when(refreshTokens.findBySecretHash(secret.hash())).thenReturn(Optional.of(existing));
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor()));
        when(refreshTokens.markUsed(existing.id(), NOW)).thenReturn(false);

        assertThatThrownBy(() -> service.refresh(secret.value()))
                .isInstanceOf(InvalidRefreshToken.class);

        verify(refreshTokens).revokeAllOf(DONOR, NOW);
        verify(accessTokens, never()).issue(any(), any(), any());
    }

    @Test
    void should_revoke_every_session_when_refreshed_given_already_used_token() {
        RefreshTokenSecret secret = RefreshTokenSecret.generate();
        RefreshToken used = RefreshToken.issue(secret, DONOR, NOW.minus(Duration.ofDays(1)), REFRESH_TTL, false);
        used.markUsed(NOW.minus(Duration.ofHours(1)));
        when(refreshTokens.findBySecretHash(secret.hash())).thenReturn(Optional.of(used));

        assertThatThrownBy(() -> service.refresh(secret.value()))
                .isInstanceOf(InvalidRefreshToken.class);

        verify(refreshTokens).revokeAllOf(DONOR, NOW);
        verify(accessTokens, never()).issue(any(), any(), any());
    }

    @Test
    void should_refuse_without_ending_other_sessions_when_refreshed_given_revoked_token() {
        RefreshTokenSecret secret = RefreshTokenSecret.generate();
        RefreshToken revoked = RefreshToken.issue(secret, DONOR, NOW.minus(Duration.ofDays(1)), REFRESH_TTL, false);
        revoked.revoke(NOW.minus(Duration.ofHours(1)));
        when(refreshTokens.findBySecretHash(secret.hash())).thenReturn(Optional.of(revoked));

        assertThatThrownBy(() -> service.refresh(secret.value()))
                .isInstanceOf(InvalidRefreshToken.class);

        verify(refreshTokens, never()).revokeAllOf(any(), any());
        verify(accessTokens, never()).issue(any(), any(), any());
    }

    @Test
    void should_refuse_when_refreshed_given_expired_token() {
        RefreshTokenSecret secret = RefreshTokenSecret.generate();
        RefreshToken expired = RefreshToken.issue(secret, DONOR, NOW.minus(REFRESH_TTL), REFRESH_TTL, false);
        when(refreshTokens.findBySecretHash(secret.hash())).thenReturn(Optional.of(expired));

        assertThatThrownBy(() -> service.refresh(secret.value()))
                .isInstanceOf(InvalidRefreshToken.class);

        verify(refreshTokens, never()).revokeAllOf(any(), any());
    }

    @Test
    void should_refuse_when_refreshed_given_unknown_token() {
        when(refreshTokens.findBySecretHash(any())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.refresh(RefreshTokenSecret.generate().value()))
                .isInstanceOf(InvalidRefreshToken.class);
    }

    @Test
    void should_revoke_token_when_closed_given_known_token() {
        RefreshTokenSecret secret = RefreshTokenSecret.generate();
        RefreshToken existing = RefreshToken.issue(secret, DONOR, NOW.minus(Duration.ofDays(1)), REFRESH_TTL, false);
        when(refreshTokens.findBySecretHash(secret.hash())).thenReturn(Optional.of(existing));

        service.close(secret.value());

        assertThat(existing.isRevoked()).isTrue();
        verify(refreshTokens).save(existing);
    }

    @Test
    void should_do_nothing_when_closed_given_unknown_token() {
        when(refreshTokens.findBySecretHash(any())).thenReturn(Optional.empty());

        service.close(RefreshTokenSecret.generate().value());

        verify(refreshTokens, never()).save(any());
    }

    @Test
    @DisplayName("Given an administrator, when a session opens with the second factor verified, then ADMIN is granted and the refresh token remembers the verification")
    void should_grant_admin_and_flag_refresh_token_when_session_opened_given_administrator_with_second_factor() {
        when(accessTokens.issue(DONOR, Set.of(Role.DONOR, Role.ADMIN), NOW)).thenReturn(new IssuedAccessToken("access", NOW.plus(Duration.ofMinutes(15))));

        IssuedTokens tokens = service.open(administrator(), true);

        ArgumentCaptor<RefreshToken> stored = ArgumentCaptor.forClass(RefreshToken.class);
        verify(refreshTokens).save(stored.capture());
        assertThat(stored.getValue().secondFactorVerified()).isTrue();
        assertThat(tokens.roles()).containsExactlyInAnyOrder(Role.DONOR, Role.ADMIN);
    }

    @Test
    @DisplayName("Given an administrator, when a session opens without the second factor, then only DONOR is granted")
    void should_grant_donor_only_when_session_opened_given_administrator_without_second_factor() {
        when(accessTokens.issue(DONOR, Set.of(Role.DONOR), NOW)).thenReturn(new IssuedAccessToken("access", NOW.plus(Duration.ofMinutes(15))));

        IssuedTokens tokens = service.open(administrator(), false);

        ArgumentCaptor<RefreshToken> stored = ArgumentCaptor.forClass(RefreshToken.class);
        verify(refreshTokens).save(stored.capture());
        assertThat(stored.getValue().secondFactorVerified()).isFalse();
        assertThat(tokens.roles()).containsExactly(Role.DONOR);
    }

    @Test
    @DisplayName("Given a verified refresh token of an administrator, when it is refreshed, then ADMIN stays granted and the new token stays verified")
    void should_keep_admin_when_refreshed_given_verified_token_of_administrator() {
        RefreshTokenSecret secret = RefreshTokenSecret.generate();
        RefreshToken existing = RefreshToken.issue(secret, DONOR, NOW.minus(Duration.ofDays(1)), REFRESH_TTL, true);
        when(refreshTokens.findBySecretHash(secret.hash())).thenReturn(Optional.of(existing));
        when(donors.findById(DONOR)).thenReturn(Optional.of(administrator()));
        when(accessTokens.issue(DONOR, Set.of(Role.DONOR, Role.ADMIN), NOW)).thenReturn(new IssuedAccessToken("access2", NOW.plus(Duration.ofMinutes(15))));
        when(refreshTokens.markUsed(existing.id(), NOW)).thenReturn(true);

        RefreshedSession refreshed = service.refresh(secret.value());

        assertThat(refreshed.tokens().roles()).containsExactlyInAnyOrder(Role.DONOR, Role.ADMIN);
        ArgumentCaptor<RefreshToken> saved = ArgumentCaptor.forClass(RefreshToken.class);
        verify(refreshTokens).save(saved.capture());
        assertThat(saved.getValue().secondFactorVerified()).isTrue();
    }

    private static Donor administrator() {
        return Donor.reconstitute(DONOR, DonorType.PERSON, "Jana Nováková", null, new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"),
                new EmailAddress("jana@example.cz"), new PasswordHash("$hash"), new VariableSymbol("1234567890"), LocaleCode.CS,
                Set.of(Role.DONOR, Role.ADMIN), NOW, NOW, null);
    }
}
