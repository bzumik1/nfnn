package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.DeviceBrowser;
import cz.novanadeje.app.donors.domain.DeviceDescription;
import cz.novanadeje.app.donors.domain.DeviceId;
import cz.novanadeje.app.donors.domain.DevicePlatform;
import cz.novanadeje.app.donors.domain.DeviceSignOutReason;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorDevice;
import cz.novanadeje.app.donors.domain.DonorDeviceRepository;
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
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DonorSessionServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-17T10:00:00Z");
    private static final Duration REFRESH_TTL = Duration.ofDays(14);
    private static final DonorId DONOR = DonorId.newId(NOW);
    private static final DeviceId DEVICE = DeviceId.newId(NOW.minus(Duration.ofDays(2)));

    @Mock
    private RefreshTokenRepository refreshTokens;
    @Mock
    private DonorRepository donors;
    @Mock
    private AccessTokenIssuer accessTokens;
    @Mock
    private DonorDeviceRepository devices;
    @Mock
    private DeviceSignOuts signOuts;

    private DonorSessionService service;

    @BeforeEach
    void setUp() {
        service = new DonorSessionService(refreshTokens, devices, signOuts, donors, accessTokens, new DonorSessionProperties(REFRESH_TTL),
                Clock.fixed(NOW, ZoneOffset.UTC));
        lenient().when(devices.findById(DEVICE)).thenReturn(Optional.of(signedInDevice()));
    }

    private static Donor donor() {
        return Donor.register(DONOR, DonorType.PERSON, "Jana Nováková", null, new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"),
                new EmailAddress("jana@example.cz"), new PasswordHash("$hash"), new VariableSymbol("1234567890"), LocaleCode.CS, NOW);
    }

    @Test
    @DisplayName("Given a donor, when a session opens, then an access token is issued and only the hash of the refresh token is stored")
    void should_issue_tokens_and_store_hash_when_session_opened() {
        when(accessTokens.issue(eq(DONOR), eq(Set.of(Role.DONOR)), any(DeviceId.class), eq(NOW))).thenReturn(new IssuedAccessToken("access", NOW.plus(Duration.ofMinutes(15))));

        IssuedTokens tokens = service.open(donor(), false, DeviceDescription.UNKNOWN);

        ArgumentCaptor<RefreshToken> stored = ArgumentCaptor.forClass(RefreshToken.class);
        verify(refreshTokens).save(stored.capture());
        assertThat(stored.getValue().secretHash()).isEqualTo(RefreshTokenSecret.fromValue(tokens.refreshToken()).hash());
        assertThat(stored.getValue().expiresAt()).isEqualTo(NOW.plus(REFRESH_TTL));
        assertThat(tokens.accessToken()).isEqualTo("access");
        assertThat(tokens.refreshTokenExpiresAt()).isEqualTo(NOW.plus(REFRESH_TTL));
    }

    @Test
    @DisplayName("Given a usable token, when the session is refreshed, then the old token is used up and a new one issued")
    void should_use_up_old_and_issue_new_when_refreshed_given_usable_token() {
        RefreshTokenSecret secret = RefreshTokenSecret.generate();
        RefreshToken existing = RefreshToken.issue(secret, DONOR, DEVICE, NOW.minus(Duration.ofDays(1)), REFRESH_TTL, false);
        when(refreshTokens.findBySecretHashForUpdate(secret.hash())).thenReturn(Optional.of(existing));
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor()));
        when(accessTokens.issue(eq(DONOR), eq(Set.of(Role.DONOR)), any(DeviceId.class), eq(NOW))).thenReturn(new IssuedAccessToken("access2", NOW.plus(Duration.ofMinutes(15))));
        when(refreshTokens.markUsed(existing.id(), NOW)).thenReturn(true);

        RefreshedSession refreshed = service.refresh(secret.value(), DeviceDescription.UNKNOWN);

        verify(refreshTokens).markUsed(existing.id(), NOW);
        verify(signOuts, never()).endAllOf(any(), any(), any());
        assertThat(refreshed.donor().id()).isEqualTo(DONOR);
        assertThat(refreshed.tokens().refreshToken()).isNotEqualTo(secret.value());
        verify(donors, never()).recordSignIn(any(), any());
    }

    @Test
    @DisplayName("Given an administrator, when they sign in with the second factor, then the sign-in is recorded and the session opens for the administration")
    void should_record_sign_in_when_signed_in_given_administrator_with_second_factor() {
        when(accessTokens.issue(eq(DONOR), eq(Set.of(Role.DONOR, Role.ADMIN)), any(DeviceId.class), eq(NOW))).thenReturn(new IssuedAccessToken("access", NOW.plus(Duration.ofMinutes(15))));

        IssuedTokens tokens = service.signIn(administrator(), true, DeviceDescription.UNKNOWN);

        verify(donors).recordSignIn(DONOR, NOW);
        assertThat(tokens.roles()).containsExactlyInAnyOrder(Role.DONOR, Role.ADMIN);
    }

    @Test
    @DisplayName("Given an administrator without the second factor, when they sign in as a plain donor, then no sign-in to the administration is recorded")
    void should_not_record_sign_in_when_signed_in_given_administrator_without_second_factor() {
        when(accessTokens.issue(eq(DONOR), eq(Set.of(Role.DONOR)), any(DeviceId.class), eq(NOW))).thenReturn(new IssuedAccessToken("access", NOW.plus(Duration.ofMinutes(15))));

        service.signIn(administrator(), false, DeviceDescription.UNKNOWN);

        verify(donors, never()).recordSignIn(any(), any());
    }

    @Test
    @DisplayName("Given a plain donor, when they sign in, then no sign-in is recorded")
    void should_not_record_sign_in_when_signed_in_given_plain_donor() {
        when(accessTokens.issue(eq(DONOR), eq(Set.of(Role.DONOR)), any(DeviceId.class), eq(NOW))).thenReturn(new IssuedAccessToken("access", NOW.plus(Duration.ofMinutes(15))));

        service.signIn(donor(), true, DeviceDescription.UNKNOWN);

        verify(donors, never()).recordSignIn(any(), any());
    }

    @Test
    @DisplayName("Given an administrator, when a session opens again after a credential change, then it is not counted as a sign-in")
    void should_not_record_sign_in_when_session_opened_given_administrator() {
        when(accessTokens.issue(eq(DONOR), eq(Set.of(Role.DONOR, Role.ADMIN)), any(DeviceId.class), eq(NOW))).thenReturn(new IssuedAccessToken("access", NOW.plus(Duration.ofMinutes(15))));

        service.open(administrator(), true, DeviceDescription.UNKNOWN);

        verify(donors, never()).recordSignIn(any(), any());
    }

    @Test
    @DisplayName("Given a refresh token another request uses at the same moment, when it is refreshed, then every session of the donor ends")
    void should_revoke_every_session_when_refreshed_given_token_used_concurrently() {
        RefreshTokenSecret secret = RefreshTokenSecret.generate();
        RefreshToken existing = RefreshToken.issue(secret, DONOR, DEVICE, NOW.minus(Duration.ofDays(1)), REFRESH_TTL, false);
        when(refreshTokens.findBySecretHashForUpdate(secret.hash())).thenReturn(Optional.of(existing));
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor()));
        when(refreshTokens.markUsed(existing.id(), NOW)).thenReturn(false);

        assertThatThrownBy(() -> service.refresh(secret.value(), DeviceDescription.UNKNOWN))
                .isInstanceOf(InvalidRefreshToken.class);

        verify(signOuts).endAllOf(DONOR, DeviceSignOutReason.REPLAY, NOW);
        verify(accessTokens, never()).issue(any(), any(), any(), any());
    }

    @Test
    @DisplayName("Given an already used token, when the session is refreshed, then every session is revoked")
    void should_revoke_every_session_when_refreshed_given_already_used_token() {
        RefreshTokenSecret secret = RefreshTokenSecret.generate();
        RefreshToken used = RefreshToken.issue(secret, DONOR, DEVICE, NOW.minus(Duration.ofDays(1)), REFRESH_TTL, false);
        used.markUsed(NOW.minus(Duration.ofHours(1)));
        when(refreshTokens.findBySecretHashForUpdate(secret.hash())).thenReturn(Optional.of(used));

        assertThatThrownBy(() -> service.refresh(secret.value(), DeviceDescription.UNKNOWN))
                .isInstanceOf(InvalidRefreshToken.class);

        verify(signOuts).endAllOf(DONOR, DeviceSignOutReason.REPLAY, NOW);
        verify(accessTokens, never()).issue(any(), any(), any(), any());
    }

    @Test
    @DisplayName("Given a revoked token, when the session is refreshed, then it is refused without ending other sessions")
    void should_refuse_without_ending_other_sessions_when_refreshed_given_revoked_token() {
        RefreshTokenSecret secret = RefreshTokenSecret.generate();
        RefreshToken revoked = RefreshToken.issue(secret, DONOR, DEVICE, NOW.minus(Duration.ofDays(1)), REFRESH_TTL, false);
        revoked.revoke(NOW.minus(Duration.ofHours(1)));
        when(refreshTokens.findBySecretHashForUpdate(secret.hash())).thenReturn(Optional.of(revoked));

        assertThatThrownBy(() -> service.refresh(secret.value(), DeviceDescription.UNKNOWN))
                .isInstanceOf(InvalidRefreshToken.class);

        verify(signOuts, never()).endAllOf(any(), any(), any());
        verify(accessTokens, never()).issue(any(), any(), any(), any());
    }

    @Test
    @DisplayName("Given an expired token, when the session is refreshed, then it is refused")
    void should_refuse_when_refreshed_given_expired_token() {
        RefreshTokenSecret secret = RefreshTokenSecret.generate();
        RefreshToken expired = RefreshToken.issue(secret, DONOR, DEVICE, NOW.minus(REFRESH_TTL), REFRESH_TTL, false);
        when(refreshTokens.findBySecretHashForUpdate(secret.hash())).thenReturn(Optional.of(expired));

        assertThatThrownBy(() -> service.refresh(secret.value(), DeviceDescription.UNKNOWN))
                .isInstanceOf(InvalidRefreshToken.class);

        verify(signOuts, never()).endAllOf(any(), any(), any());
    }

    @Test
    @DisplayName("Given an unknown token, when the session is refreshed, then it is refused")
    void should_refuse_when_refreshed_given_unknown_token() {
        when(refreshTokens.findBySecretHashForUpdate(any())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.refresh(RefreshTokenSecret.generate().value(), DeviceDescription.UNKNOWN))
                .isInstanceOf(InvalidRefreshToken.class);
    }

    @Test
    @DisplayName("Given a known token, when the session is closed, then the token is revoked")
    void should_revoke_token_when_closed_given_known_token() {
        RefreshTokenSecret secret = RefreshTokenSecret.generate();
        RefreshToken existing = RefreshToken.issue(secret, DONOR, DEVICE, NOW.minus(Duration.ofDays(1)), REFRESH_TTL, false);
        when(refreshTokens.findBySecretHashForUpdate(secret.hash())).thenReturn(Optional.of(existing));

        service.close(secret.value());

        verify(refreshTokens).revokeIfUnused(existing.id(), NOW);
        verify(signOuts, never()).endAllOf(any(), any(), any());
    }

    @Test
    @DisplayName("Given a used token whose successor another tab just received, when the session is closed with it, then the unused successor is revoked too")
    void should_revoke_the_unused_successor_when_closed_given_a_used_token() {
        RefreshTokenSecret secret = RefreshTokenSecret.generate();
        UUID successor = UUID.randomUUID();
        RefreshToken used = rotated(secret, NOW.minusSeconds(5), successor, false);
        when(refreshTokens.findBySecretHashForUpdate(secret.hash())).thenReturn(Optional.of(used));

        service.close(secret.value());

        verify(refreshTokens).revokeIfUnused(used.id(), NOW);
        verify(refreshTokens).revokeIfUnused(successor, NOW);
        verify(signOuts, never()).endAllOf(any(), any(), any());
    }

    @Test
    @DisplayName("Given a token the reuse grace superseded, when it is presented, then every session of the donor ends, because two holders of the session exist")
    void should_revoke_every_session_when_presented_given_a_token_superseded_by_the_grace() {
        RefreshTokenSecret secret = RefreshTokenSecret.generate();
        RefreshToken superseded = RefreshToken.issue(secret, DONOR, DEVICE, NOW.minusSeconds(30), REFRESH_TTL, false);
        superseded.supersede(NOW.minusSeconds(20));
        when(refreshTokens.findBySecretHashForUpdate(secret.hash())).thenReturn(Optional.of(superseded));

        assertThatThrownBy(() -> service.refresh(secret.value(), DeviceDescription.UNKNOWN))
                .isInstanceOf(InvalidRefreshToken.class);

        verify(signOuts).endAllOf(DONOR, DeviceSignOutReason.REPLAY, NOW);
        verify(accessTokens, never()).issue(any(), any(), any(), any());
    }

    @Test
    @DisplayName("Given a token the reuse grace superseded, when the session is closed with it, then every session of the donor ends, because two holders of the session exist")
    void should_revoke_every_session_when_closed_given_a_token_superseded_by_the_grace() {
        RefreshTokenSecret secret = RefreshTokenSecret.generate();
        RefreshToken superseded = RefreshToken.issue(secret, DONOR, DEVICE, NOW.minusSeconds(30), REFRESH_TTL, false);
        superseded.supersede(NOW.minusSeconds(20));
        when(refreshTokens.findBySecretHashForUpdate(secret.hash())).thenReturn(Optional.of(superseded));

        service.close(secret.value());

        verify(signOuts).endAllOf(DONOR, DeviceSignOutReason.REPLAY, NOW);
        verify(refreshTokens, never()).revokeAllOf(any(), any());
    }

    @Test
    @DisplayName("Given an unknown token, when the session is closed, then nothing happens")
    void should_do_nothing_when_closed_given_unknown_token() {
        when(refreshTokens.findBySecretHashForUpdate(any())).thenReturn(Optional.empty());

        service.close(RefreshTokenSecret.generate().value());

        verify(refreshTokens, never()).save(any());
    }

    @Test
    @DisplayName("Given an administrator, when a session opens with the second factor verified, then ADMIN is granted and the refresh token remembers the verification")
    void should_grant_admin_and_flag_refresh_token_when_session_opened_given_administrator_with_second_factor() {
        when(accessTokens.issue(eq(DONOR), eq(Set.of(Role.DONOR, Role.ADMIN)), any(DeviceId.class), eq(NOW))).thenReturn(new IssuedAccessToken("access", NOW.plus(Duration.ofMinutes(15))));

        IssuedTokens tokens = service.open(administrator(), true, DeviceDescription.UNKNOWN);

        ArgumentCaptor<RefreshToken> stored = ArgumentCaptor.forClass(RefreshToken.class);
        verify(refreshTokens).save(stored.capture());
        assertThat(stored.getValue().secondFactorVerified()).isTrue();
        assertThat(tokens.roles()).containsExactlyInAnyOrder(Role.DONOR, Role.ADMIN);
    }

    @Test
    @DisplayName("Given an administrator, when a session opens without the second factor, then only DONOR is granted")
    void should_grant_donor_only_when_session_opened_given_administrator_without_second_factor() {
        when(accessTokens.issue(eq(DONOR), eq(Set.of(Role.DONOR)), any(DeviceId.class), eq(NOW))).thenReturn(new IssuedAccessToken("access", NOW.plus(Duration.ofMinutes(15))));

        IssuedTokens tokens = service.open(administrator(), false, DeviceDescription.UNKNOWN);

        ArgumentCaptor<RefreshToken> stored = ArgumentCaptor.forClass(RefreshToken.class);
        verify(refreshTokens).save(stored.capture());
        assertThat(stored.getValue().secondFactorVerified()).isFalse();
        assertThat(tokens.roles()).containsExactly(Role.DONOR);
    }

    @Test
    @DisplayName("Given a verified refresh token of an administrator, when it is refreshed, then ADMIN stays granted and the new token stays verified")
    void should_keep_admin_when_refreshed_given_verified_token_of_administrator() {
        RefreshTokenSecret secret = RefreshTokenSecret.generate();
        RefreshToken existing = RefreshToken.issue(secret, DONOR, DEVICE, NOW.minus(Duration.ofDays(1)), REFRESH_TTL, true);
        when(refreshTokens.findBySecretHashForUpdate(secret.hash())).thenReturn(Optional.of(existing));
        when(donors.findById(DONOR)).thenReturn(Optional.of(administrator()));
        when(accessTokens.issue(eq(DONOR), eq(Set.of(Role.DONOR, Role.ADMIN)), any(DeviceId.class), eq(NOW))).thenReturn(new IssuedAccessToken("access2", NOW.plus(Duration.ofMinutes(15))));
        when(refreshTokens.markUsed(existing.id(), NOW)).thenReturn(true);

        RefreshedSession refreshed = service.refresh(secret.value(), DeviceDescription.UNKNOWN);

        assertThat(refreshed.tokens().roles()).containsExactlyInAnyOrder(Role.DONOR, Role.ADMIN);
        ArgumentCaptor<RefreshToken> saved = ArgumentCaptor.forClass(RefreshToken.class);
        verify(refreshTokens).save(saved.capture());
        assertThat(saved.getValue().secondFactorVerified()).isTrue();
    }

    @Test
    @DisplayName("Given a usable token, when the session is refreshed, then the new token is recorded as its successor")
    void should_record_the_new_token_as_successor_when_refreshed_given_usable_token() {
        RefreshTokenSecret secret = RefreshTokenSecret.generate();
        RefreshToken existing = RefreshToken.issue(secret, DONOR, DEVICE, NOW.minus(Duration.ofDays(1)), REFRESH_TTL, false);
        when(refreshTokens.findBySecretHashForUpdate(secret.hash())).thenReturn(Optional.of(existing));
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor()));
        when(accessTokens.issue(eq(DONOR), eq(Set.of(Role.DONOR)), any(DeviceId.class), eq(NOW))).thenReturn(new IssuedAccessToken("access2", NOW.plus(Duration.ofMinutes(15))));
        when(refreshTokens.markUsed(existing.id(), NOW)).thenReturn(true);

        RefreshedSession refreshed = service.refresh(secret.value(), DeviceDescription.UNKNOWN);

        ArgumentCaptor<RefreshToken> saved = ArgumentCaptor.forClass(RefreshToken.class);
        verify(refreshTokens).save(saved.capture());
        assertThat(saved.getValue().secretHash()).isEqualTo(RefreshTokenSecret.fromValue(refreshed.tokens().refreshToken()).hash());
        verify(refreshTokens).recordSuccessor(existing.id(), saved.getValue().id());
    }

    @Test
    @DisplayName("Given a token used 59 seconds ago whose successor was never used, when it is presented again, then the successor is revoked and a new session token issued without ending other sessions")
    void should_revoke_the_unused_successor_and_issue_a_new_token_when_presented_again_given_use_within_the_reuse_grace() {
        RefreshTokenSecret secret = RefreshTokenSecret.generate();
        UUID successor = UUID.randomUUID();
        RefreshToken used = rotated(secret, NOW.minusSeconds(59), successor, true);
        when(refreshTokens.findBySecretHashForUpdate(secret.hash())).thenReturn(Optional.of(used));
        when(donors.findById(DONOR)).thenReturn(Optional.of(administrator()));
        when(refreshTokens.supersedeIfUnused(successor, NOW)).thenReturn(true);
        when(accessTokens.issue(eq(DONOR), eq(Set.of(Role.DONOR, Role.ADMIN)), any(DeviceId.class), eq(NOW))).thenReturn(new IssuedAccessToken("access3", NOW.plus(Duration.ofMinutes(15))));

        RefreshedSession refreshed = service.refresh(secret.value(), DeviceDescription.UNKNOWN);

        verify(refreshTokens).supersedeIfUnused(successor, NOW);
        verify(signOuts, never()).endAllOf(any(), any(), any());
        verify(refreshTokens, never()).markUsed(any(), any());
        ArgumentCaptor<RefreshToken> saved = ArgumentCaptor.forClass(RefreshToken.class);
        verify(refreshTokens).save(saved.capture());
        assertThat(saved.getValue().secondFactorVerified()).isTrue();
        assertThat(saved.getValue().expiresAt()).isEqualTo(NOW.plus(REFRESH_TTL));
        verify(refreshTokens).recordSuccessor(used.id(), saved.getValue().id());
        assertThat(refreshed.tokens().accessToken()).isEqualTo("access3");
        assertThat(refreshed.tokens().roles()).containsExactlyInAnyOrder(Role.DONOR, Role.ADMIN);
    }

    @Test
    @DisplayName("Given a token used 10 seconds ago whose successor was used meanwhile, when it is presented again, then every session of the donor ends")
    void should_revoke_every_session_when_presented_again_given_successor_already_used() {
        RefreshTokenSecret secret = RefreshTokenSecret.generate();
        UUID successor = UUID.randomUUID();
        RefreshToken used = rotated(secret, NOW.minusSeconds(10), successor, false);
        when(refreshTokens.findBySecretHashForUpdate(secret.hash())).thenReturn(Optional.of(used));
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor()));
        when(refreshTokens.supersedeIfUnused(successor, NOW)).thenReturn(false);

        assertThatThrownBy(() -> service.refresh(secret.value(), DeviceDescription.UNKNOWN))
                .isInstanceOf(InvalidRefreshToken.class);

        verify(signOuts).endAllOf(DONOR, DeviceSignOutReason.REPLAY, NOW);
        verify(refreshTokens, never()).save(any());
        verify(accessTokens, never()).issue(any(), any(), any(), any());
    }

    @Test
    @DisplayName("Given a token used 60 seconds ago whose successor was never used, when it is presented again, then every session of the donor ends and the successor is left to that revocation")
    void should_revoke_every_session_when_presented_again_given_use_at_the_end_of_the_reuse_grace() {
        RefreshTokenSecret secret = RefreshTokenSecret.generate();
        UUID successor = UUID.randomUUID();
        RefreshToken used = rotated(secret, NOW.minus(RefreshToken.REUSE_GRACE), successor, false);
        when(refreshTokens.findBySecretHashForUpdate(secret.hash())).thenReturn(Optional.of(used));

        assertThatThrownBy(() -> service.refresh(secret.value(), DeviceDescription.UNKNOWN))
                .isInstanceOf(InvalidRefreshToken.class);

        verify(signOuts).endAllOf(DONOR, DeviceSignOutReason.REPLAY, NOW);
        verify(refreshTokens, never()).supersedeIfUnused(any(), any());
        verify(accessTokens, never()).issue(any(), any(), any(), any());
    }

    @Test
    @DisplayName("Given a token used 10 seconds ago whose donor no longer exists, when it is presented again, then no session is issued and the successor is left to the revocation of every session")
    void should_issue_nothing_when_presented_again_within_the_reuse_grace_given_an_erased_donor() {
        RefreshTokenSecret secret = RefreshTokenSecret.generate();
        UUID successor = UUID.randomUUID();
        RefreshToken used = rotated(secret, NOW.minusSeconds(10), successor, false);
        when(refreshTokens.findBySecretHashForUpdate(secret.hash())).thenReturn(Optional.of(used));
        when(donors.findById(DONOR)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.refresh(secret.value(), DeviceDescription.UNKNOWN))
                .isInstanceOf(InvalidRefreshToken.class);

        verify(refreshTokens, never()).supersedeIfUnused(any(), any());
        verify(signOuts).endAllOf(DONOR, DeviceSignOutReason.REPLAY, NOW);
        verify(refreshTokens, never()).save(any());
        verify(accessTokens, never()).issue(any(), any(), any(), any());
    }

    @Test
    @DisplayName("Given an iPhone, when the donor signs in, then a device is saved with its description and both tokens carry it")
    void should_save_device_and_bind_tokens_when_signed_in_given_iphone() {
        DeviceDescription iphone = new DeviceDescription(DevicePlatform.IPHONE, DeviceBrowser.SAFARI);
        when(accessTokens.issue(eq(DONOR), eq(Set.of(Role.DONOR, Role.ADMIN)), any(DeviceId.class), eq(NOW)))
                .thenReturn(new IssuedAccessToken("access", NOW.plus(Duration.ofMinutes(15))));

        service.signIn(administrator(), true, iphone);

        ArgumentCaptor<DonorDevice> device = ArgumentCaptor.forClass(DonorDevice.class);
        verify(devices).save(device.capture());
        assertThat(device.getValue().description()).isEqualTo(iphone);
        assertThat(device.getValue().signedInAt()).isEqualTo(NOW);
        ArgumentCaptor<RefreshToken> stored = ArgumentCaptor.forClass(RefreshToken.class);
        verify(refreshTokens).save(stored.capture());
        assertThat(stored.getValue().deviceId()).contains(device.getValue().id());
        verify(accessTokens).issue(DONOR, Set.of(Role.DONOR, Role.ADMIN), device.getValue().id(), NOW);
    }

    @Test
    @DisplayName("Given a usable token of a signed-in device, when the session is refreshed, then the device records the use and the new tokens carry it")
    void should_record_use_and_keep_device_when_refreshed_given_device_token() {
        RefreshTokenSecret secret = RefreshTokenSecret.generate();
        RefreshToken existing = RefreshToken.issue(secret, DONOR, DEVICE, NOW.minus(Duration.ofDays(1)), REFRESH_TTL, false);
        when(refreshTokens.findBySecretHashForUpdate(secret.hash())).thenReturn(Optional.of(existing));
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor()));
        when(refreshTokens.markUsed(existing.id(), NOW)).thenReturn(true);
        when(accessTokens.issue(DONOR, Set.of(Role.DONOR), DEVICE, NOW)).thenReturn(new IssuedAccessToken("access2", NOW.plus(Duration.ofMinutes(15))));

        service.refresh(secret.value(), DeviceDescription.UNKNOWN);

        ArgumentCaptor<DonorDevice> device = ArgumentCaptor.forClass(DonorDevice.class);
        verify(devices).save(device.capture());
        assertThat(device.getValue().id()).isEqualTo(DEVICE);
        assertThat(device.getValue().lastUsedAt()).isEqualTo(NOW);
        ArgumentCaptor<RefreshToken> stored = ArgumentCaptor.forClass(RefreshToken.class);
        verify(refreshTokens).save(stored.capture());
        assertThat(stored.getValue().deviceId()).contains(DEVICE);
    }

    @Test
    @DisplayName("Given a token issued before devices existed, when the session is refreshed, then a device signed in at the token's issue is created for it")
    void should_create_device_from_token_when_refreshed_given_token_without_device() {
        RefreshTokenSecret secret = RefreshTokenSecret.generate();
        Instant issued = NOW.minus(Duration.ofDays(3));
        RefreshToken legacy = RefreshToken.reconstitute(UUID.randomUUID(), DONOR, secret.hash(), issued, issued.plus(REFRESH_TTL), false, null,
                Set.of(), issued, null, null, null, null, null);
        DeviceDescription android = new DeviceDescription(DevicePlatform.ANDROID, DeviceBrowser.CHROME);
        when(refreshTokens.findBySecretHashForUpdate(secret.hash())).thenReturn(Optional.of(legacy));
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor()));
        when(refreshTokens.markUsed(legacy.id(), NOW)).thenReturn(true);
        when(accessTokens.issue(eq(DONOR), eq(Set.of(Role.DONOR)), any(DeviceId.class), eq(NOW)))
                .thenReturn(new IssuedAccessToken("access2", NOW.plus(Duration.ofMinutes(15))));

        service.refresh(secret.value(), android);

        ArgumentCaptor<DonorDevice> device = ArgumentCaptor.forClass(DonorDevice.class);
        verify(devices).save(device.capture());
        assertThat(device.getValue().description()).isEqualTo(android);
        assertThat(device.getValue().signedInAt()).isEqualTo(issued);
        assertThat(device.getValue().lastUsedAt()).isEqualTo(NOW);
        verify(accessTokens).issue(DONOR, Set.of(Role.DONOR), device.getValue().id(), NOW);
    }

    @Test
    @DisplayName("Given a usable token of a device signed out elsewhere, when the session is refreshed, then it is refused and nothing is issued")
    void should_refuse_when_refreshed_given_device_signed_out() {
        RefreshTokenSecret secret = RefreshTokenSecret.generate();
        RefreshToken existing = RefreshToken.issue(secret, DONOR, DEVICE, NOW.minus(Duration.ofDays(1)), REFRESH_TTL, false);
        DonorDevice ended = signedInDevice();
        ended.end(DeviceSignOutReason.REMOTE_SIGN_OUT, NOW.minusSeconds(5));
        when(devices.findById(DEVICE)).thenReturn(Optional.of(ended));
        when(refreshTokens.findBySecretHashForUpdate(secret.hash())).thenReturn(Optional.of(existing));
        when(donors.findById(DONOR)).thenReturn(Optional.of(donor()));
        when(refreshTokens.markUsed(existing.id(), NOW)).thenReturn(true);

        assertThatThrownBy(() -> service.refresh(secret.value(), DeviceDescription.UNKNOWN)).isInstanceOf(InvalidRefreshToken.class);

        verify(accessTokens, never()).issue(any(), any(), any(), any());
        verify(refreshTokens, never()).save(any());
    }

    @Test
    @DisplayName("Given a token of a signed-in device, when the session is closed, then the device ends as signed out")
    void should_end_device_as_signed_out_when_closed_given_device_token() {
        RefreshTokenSecret secret = RefreshTokenSecret.generate();
        RefreshToken token = RefreshToken.issue(secret, DONOR, DEVICE, NOW.minus(Duration.ofDays(1)), REFRESH_TTL, false);
        when(refreshTokens.findBySecretHashForUpdate(secret.hash())).thenReturn(Optional.of(token));

        service.close(secret.value());

        verify(signOuts).end(any(DonorDevice.class), eq(DeviceSignOutReason.SIGNED_OUT), eq(NOW));
    }

    @Test
    @DisplayName("Given the signed-in device that changed a credential, when its session continues, then new tokens are issued on that device")
    void should_issue_on_same_device_when_continued_given_active_own_device() {
        when(accessTokens.issue(DONOR, Set.of(Role.DONOR), DEVICE, NOW)).thenReturn(new IssuedAccessToken("access", NOW.plus(Duration.ofMinutes(15))));

        service.continueOn(donor(), false, new RequestingDevice(Optional.of(DEVICE), DeviceDescription.UNKNOWN));

        ArgumentCaptor<DonorDevice> device = ArgumentCaptor.forClass(DonorDevice.class);
        verify(devices).save(device.capture());
        assertThat(device.getValue().id()).isEqualTo(DEVICE);
        assertThat(device.getValue().lastUsedAt()).isEqualTo(NOW);
        ArgumentCaptor<RefreshToken> stored = ArgumentCaptor.forClass(RefreshToken.class);
        verify(refreshTokens).save(stored.capture());
        assertThat(stored.getValue().deviceId()).contains(DEVICE);
    }

    @Test
    @DisplayName("Given a session whose device already ended, when it continues, then a new device signs in")
    void should_sign_in_new_device_when_continued_given_ended_device() {
        DonorDevice ended = signedInDevice();
        ended.end(DeviceSignOutReason.REMOTE_SIGN_OUT, NOW.minusSeconds(5));
        when(devices.findById(DEVICE)).thenReturn(Optional.of(ended));
        DeviceDescription iphone = new DeviceDescription(DevicePlatform.IPHONE, DeviceBrowser.SAFARI);
        when(accessTokens.issue(eq(DONOR), eq(Set.of(Role.DONOR)), any(DeviceId.class), eq(NOW)))
                .thenReturn(new IssuedAccessToken("access", NOW.plus(Duration.ofMinutes(15))));

        service.continueOn(donor(), false, new RequestingDevice(Optional.of(DEVICE), iphone));

        ArgumentCaptor<DonorDevice> device = ArgumentCaptor.forClass(DonorDevice.class);
        verify(devices).save(device.capture());
        assertThat(device.getValue().id()).isNotEqualTo(DEVICE);
        assertThat(device.getValue().description()).isEqualTo(iphone);
    }

    private static RefreshToken rotated(RefreshTokenSecret secret, Instant usedAt, UUID successor, boolean secondFactorVerified) {
        Instant issued = usedAt.minus(Duration.ofDays(1));
        return RefreshToken.reconstitute(UUID.randomUUID(), DONOR, secret.hash(), issued, issued.plus(REFRESH_TTL), secondFactorVerified, null,
                Set.of(), issued, usedAt, null, successor, null, DEVICE);
    }

    private static DonorDevice signedInDevice() {
        return DonorDevice.reconstitute(DEVICE, DONOR, DeviceDescription.UNKNOWN, NOW.minus(Duration.ofDays(2)), NOW.minus(Duration.ofDays(1)),
                null, null);
    }

    private static Donor administrator() {
        return Donor.reconstitute(DONOR, DonorType.PERSON, "Jana Nováková", null, new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"),
                new EmailAddress("jana@example.cz"), new PasswordHash("$hash"), new VariableSymbol("1234567890"), LocaleCode.CS,
                Set.of(Role.DONOR, Role.ADMIN), NOW, NOW, null);
    }
}
