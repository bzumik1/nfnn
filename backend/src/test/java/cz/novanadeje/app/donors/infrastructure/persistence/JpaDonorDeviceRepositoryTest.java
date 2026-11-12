package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.donors.domain.SessionKind;
import cz.novanadeje.app.donors.domain.ClientId;
import cz.novanadeje.app.donors.domain.DeviceBrowser;
import cz.novanadeje.app.donors.domain.DeviceDescription;
import cz.novanadeje.app.donors.domain.DevicePlatform;
import cz.novanadeje.app.donors.domain.DeviceSignOutReason;
import cz.novanadeje.app.donors.domain.DeviceStatusSecret;
import cz.novanadeje.app.donors.domain.DeviceWipe;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorDevice;
import cz.novanadeje.app.donors.domain.DonorDeviceRepository;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.OAuthScope;
import cz.novanadeje.app.donors.domain.PasswordHash;
import cz.novanadeje.app.donors.domain.RefreshToken;
import cz.novanadeje.app.donors.domain.RefreshTokenRepository;
import cz.novanadeje.app.donors.domain.RefreshTokenSecret;
import cz.novanadeje.app.shared.domain.DonorType;
import cz.novanadeje.app.shared.domain.EmailAddress;
import cz.novanadeje.app.shared.domain.LocaleCode;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.shared.domain.VariableSymbol;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;

import java.time.Duration;
import java.time.Instant;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(DonorsPersistenceTestConfiguration.class)
class JpaDonorDeviceRepositoryTest {

    private static final Instant NOW = Instant.parse("2026-11-05T10:00:00Z");
    private static final Duration TTL = Duration.ofDays(14);
    private static final ClientId CLAUDE = new ClientId("https://claude.ai/.well-known/oauth-client");
    private static final DeviceDescription IPHONE_SAFARI = new DeviceDescription(DevicePlatform.IPHONE, DeviceBrowser.SAFARI);

    @Autowired
    private DonorDeviceRepository devices;
    @Autowired
    private RefreshTokenRepository refreshTokens;
    @Autowired
    private DonorRepository donors;
    @Autowired
    private EntityManager entityManager;

    private DonorId jana;
    private DonorId petr;

    @BeforeEach
    void setUp() {
        jana = donor("jana@example.cz", "4821937560");
        petr = donor("petr@example.cz", "4821937561");
        flushAndClear();
    }

    @Test
    @DisplayName("Given an app device, when it is found by id, then it keeps its kind of session")
    void should_keep_kind_when_found_given_app_device() {
        DonorDevice app = DonorDevice.signIn(jana, IPHONE_SAFARI, SessionKind.APP, NOW);
        devices.save(app);
        flushAndClear();

        assertThat(devices.findById(app.id()).orElseThrow().kind()).isEqualTo(SessionKind.APP);
    }

    @Test
    @DisplayName("Given a device stored before sessions had kinds, when it is found by id, then it reads as a remembered sign-in")
    void should_read_as_remembered_when_found_given_device_without_kind() {
        DonorDevice older = DonorDevice.signIn(jana, IPHONE_SAFARI, SessionKind.BROWSER, NOW);
        devices.save(older);
        flushAndClear();
        entityManager.createNativeQuery("update donor_device set session_kind = null where id = :id").setParameter("id", older.id().value()).executeUpdate();
        flushAndClear();

        assertThat(devices.findById(older.id()).orElseThrow().kind()).isEqualTo(SessionKind.REMEMBERED);
    }

    @Test
    @DisplayName("Given a device used and then ended, when it is found by id, then its description, times and end survive")
    void should_keep_description_times_and_end_when_found_given_ended_device() {
        DonorDevice phone = DonorDevice.signIn(jana, IPHONE_SAFARI, SessionKind.REMEMBERED, NOW);
        phone.recordUse(NOW.plusSeconds(600));
        phone.end(DeviceSignOutReason.REMOTE_SIGN_OUT, NOW.plusSeconds(900));
        devices.save(phone);
        flushAndClear();

        DonorDevice found = devices.findById(phone.id()).orElseThrow();

        assertThat(found.donorId()).isEqualTo(jana);
        assertThat(found.description()).isEqualTo(IPHONE_SAFARI);
        assertThat(found.signedInAt()).isEqualTo(NOW);
        assertThat(found.lastUsedAt()).isEqualTo(NOW.plusSeconds(600));
        assertThat(found.endedAt()).contains(NOW.plusSeconds(900));
        assertThat(found.endReason()).contains(DeviceSignOutReason.REMOTE_SIGN_OUT);
    }

    @Test
    @DisplayName("Given devices with and without a usable token, ended ones and another donor's, when the donor's signed-in devices are read, then only the active ones with a usable token come")
    void should_return_only_active_devices_with_usable_token_when_read_given_mixed_devices() {
        DonorDevice live = deviceWithToken(jana, NOW, TTL);
        DonorDevice spent = deviceWithToken(jana, NOW.minus(TTL).minusSeconds(1), TTL);
        DonorDevice ended = deviceWithToken(jana, NOW, TTL);
        flushAndClear();
        devices.endIfActive(ended.id(), DeviceSignOutReason.SIGNED_OUT, NOW);
        DonorDevice petrs = deviceWithToken(petr, NOW, TTL);
        flushAndClear();

        assertThat(devices.findSignedInOf(jana, NOW)).extracting(DonorDevice::id).containsExactly(live.id());
        assertThat(devices.isSignedIn(live.id(), NOW)).isTrue();
        assertThat(devices.isSignedIn(spent.id(), NOW)).isFalse();
        assertThat(devices.isSignedIn(ended.id(), NOW)).isFalse();
        assertThat(devices.findActiveOf(jana)).extracting(DonorDevice::id).containsExactlyInAnyOrder(live.id(), spent.id());
        assertThat(devices.findActiveWithoutUsableTokenAt(NOW)).extracting(DonorDevice::id).containsExactly(spent.id());
        assertThat(devices.findSignedInOf(petr, NOW)).extracting(DonorDevice::id).containsExactly(petrs.id());
    }

    @Test
    @DisplayName("Given a device whose token was rotated, when it is asked whether it is signed in, then the successor keeps it signed in")
    void should_stay_signed_in_when_asked_given_rotated_token() {
        DonorDevice phone = DonorDevice.signIn(jana, IPHONE_SAFARI, SessionKind.REMEMBERED, NOW);
        devices.save(phone);
        RefreshToken first = RefreshToken.issue(RefreshTokenSecret.generate(), jana, phone.id(), NOW, TTL, false);
        first.markUsed(NOW.plusSeconds(60));
        refreshTokens.save(first);
        refreshTokens.save(RefreshToken.issue(RefreshTokenSecret.generate(), jana, phone.id(), NOW.plusSeconds(60), TTL, false));
        flushAndClear();

        assertThat(devices.isSignedIn(phone.id(), NOW.plusSeconds(120))).isTrue();
    }

    @Test
    @DisplayName("Given devices ended before and after the cutoff and an active one, when the ended ones are deleted, then only those ended before go with their tokens")
    void should_delete_only_devices_ended_before_cutoff_when_deleted_given_mixed_devices() {
        DonorDevice old = deviceWithToken(jana, NOW, TTL);
        DonorDevice recent = deviceWithToken(jana, NOW, TTL);
        DonorDevice active = deviceWithToken(jana, NOW, TTL);
        flushAndClear();
        devices.endIfActive(old.id(), DeviceSignOutReason.EXPIRED, NOW.plusSeconds(10));
        devices.endIfActive(recent.id(), DeviceSignOutReason.EXPIRED, NOW.plusSeconds(30));
        flushAndClear();

        int deleted = devices.deleteEndedBefore(NOW.plusSeconds(20));

        assertThat(deleted).isEqualTo(1);
        assertThat(devices.findById(old.id())).isEmpty();
        assertThat(devices.findById(recent.id())).isPresent();
        assertThat(devices.findById(active.id())).isPresent();
        assertThat(entityManager.createNativeQuery("select count(*) from donor_refresh_token where device_id = :id")
                .setParameter("id", old.id().value()).getSingleResult()).isEqualTo(0L);
    }

    @Test
    @DisplayName("Given an active device already read into the session and then ended by another sign-out, when it is ended again, then the first end and its reason stay and the answer is false")
    void should_keep_first_end_when_ended_given_device_ended_after_it_was_read() {
        DonorDevice phone = DonorDevice.signIn(jana, IPHONE_SAFARI, SessionKind.REMEMBERED, NOW);
        DonorDevice laptop = DonorDevice.signIn(jana, DeviceDescription.UNKNOWN, SessionKind.REMEMBERED, NOW);
        devices.save(phone);
        devices.save(laptop);
        flushAndClear();
        assertThat(devices.findActiveWithoutUsableTokenAt(NOW.plusSeconds(1))).hasSize(2);
        entityManager.createNativeQuery("update donor_device set ended_at = :at, end_reason = 'REPLAY' where id = :id")
                .setParameter("at", NOW.plusSeconds(5)).setParameter("id", phone.id().value()).executeUpdate();

        boolean endedPhone = devices.endIfActive(phone.id(), DeviceSignOutReason.EXPIRED, NOW.plusSeconds(10));
        boolean endedLaptop = devices.endIfActive(laptop.id(), DeviceSignOutReason.EXPIRED, NOW.plusSeconds(10));
        flushAndClear();

        assertThat(endedPhone).isFalse();
        assertThat(endedLaptop).isTrue();
        DonorDevice foundPhone = devices.findById(phone.id()).orElseThrow();
        assertThat(foundPhone.endReason()).contains(DeviceSignOutReason.REPLAY);
        assertThat(foundPhone.endedAt()).contains(NOW.plusSeconds(5));
        DonorDevice foundLaptop = devices.findById(laptop.id()).orElseThrow();
        assertThat(foundLaptop.endReason()).contains(DeviceSignOutReason.EXPIRED);
        assertThat(foundLaptop.endedAt()).contains(NOW.plusSeconds(10));
    }

    @Test
    @DisplayName("Given an active device read before another sign-out ended it, when its use is recorded and it is saved, then the end and its reason stay and only the time of use moves")
    void should_keep_end_when_saved_given_device_ended_after_it_was_read() {
        DonorDevice phone = DonorDevice.signIn(jana, IPHONE_SAFARI, SessionKind.REMEMBERED, NOW);
        devices.save(phone);
        flushAndClear();
        DonorDevice readBeforeTheEnd = devices.findById(phone.id()).orElseThrow();
        assertThat(devices.endIfActive(phone.id(), DeviceSignOutReason.REMOTE_SIGN_OUT, NOW.plusSeconds(5))).isTrue();

        readBeforeTheEnd.recordUse(NOW.plusSeconds(10));
        devices.save(readBeforeTheEnd);
        flushAndClear();

        DonorDevice found = devices.findById(phone.id()).orElseThrow();
        assertThat(found.endedAt()).contains(NOW.plusSeconds(5));
        assertThat(found.endReason()).contains(DeviceSignOutReason.REMOTE_SIGN_OUT);
        assertThat(found.lastUsedAt()).isEqualTo(NOW.plusSeconds(10));
    }

    @Test
    @DisplayName("Given a device's token, another device's, a device-less browser token and a connected application's, when one device's tokens are revoked, then only its own are")
    void should_revoke_only_own_tokens_when_device_revoked_given_other_tokens() {
        DonorDevice phone = DonorDevice.signIn(jana, IPHONE_SAFARI, SessionKind.REMEMBERED, NOW);
        DonorDevice laptop = DonorDevice.signIn(jana, DeviceDescription.UNKNOWN, SessionKind.REMEMBERED, NOW);
        devices.save(phone);
        devices.save(laptop);
        RefreshTokenSecret phoneSecret = browserToken(phone);
        RefreshTokenSecret laptopSecret = browserToken(laptop);
        RefreshTokenSecret legacySecret = legacyBrowserToken(jana);
        RefreshTokenSecret connectorSecret = connectorToken(jana);
        flushAndClear();

        refreshTokens.revokeAllOfDevice(phone.id(), NOW.plusSeconds(60));

        assertThat(revoked(phoneSecret)).isTrue();
        assertThat(revoked(laptopSecret)).isFalse();
        assertThat(revoked(legacySecret)).isFalse();
        assertThat(revoked(connectorSecret)).isFalse();
    }

    @Test
    @DisplayName("Given a device's token, a device-less browser token, another donor's and a connected application's, when the device-less browser tokens are revoked, then only the donor's device-less browser token is")
    void should_revoke_only_deviceless_browser_tokens_when_revoked_given_other_tokens() {
        DonorDevice phone = DonorDevice.signIn(jana, IPHONE_SAFARI, SessionKind.REMEMBERED, NOW);
        devices.save(phone);
        RefreshTokenSecret phoneSecret = browserToken(phone);
        RefreshTokenSecret legacySecret = legacyBrowserToken(jana);
        RefreshTokenSecret petrsLegacySecret = legacyBrowserToken(petr);
        RefreshTokenSecret connectorSecret = connectorToken(jana);
        flushAndClear();

        refreshTokens.revokeDevicelessBrowserTokensOf(jana, NOW.plusSeconds(60));

        assertThat(revoked(legacySecret)).isTrue();
        assertThat(revoked(phoneSecret)).isFalse();
        assertThat(revoked(petrsLegacySecret)).isFalse();
        assertThat(revoked(connectorSecret)).isFalse();
    }

    @Test
    @DisplayName("Given a token revoked before the cutoff but expiring after it, one expired before it, one revoked after it, one used but still valid and one live, when the spent ones are deleted, then only those revoked or expired before the cutoff go, even one revoked before it that expires after it")
    void should_delete_only_revoked_or_expired_tokens_when_deleted_given_mixed_tokens() {
        DonorDevice phone = DonorDevice.signIn(jana, IPHONE_SAFARI, SessionKind.REMEMBERED, NOW.minus(Duration.ofDays(60)));
        devices.save(phone);
        RefreshTokenSecret revokedSecret = token(phone, NOW.minus(Duration.ofDays(35)), null, NOW.minus(Duration.ofDays(34)));
        RefreshTokenSecret recentlyRevokedSecret = token(phone, NOW.minus(Duration.ofDays(20)), null, NOW.minus(Duration.ofDays(10)));
        RefreshTokenSecret expiredSecret = token(phone, NOW.minus(Duration.ofDays(50)), null, null);
        RefreshTokenSecret usedSecret = token(phone, NOW.minus(Duration.ofDays(1)), NOW.minus(Duration.ofHours(1)), null);
        RefreshTokenSecret liveSecret = token(phone, NOW, null, null);
        flushAndClear();

        int deleted = refreshTokens.deleteSpentBefore(NOW.minus(Duration.ofDays(30)));

        assertThat(deleted).isEqualTo(2);
        assertThat(refreshTokens.findBySecretHash(revokedSecret.hash())).isEmpty();
        assertThat(refreshTokens.findBySecretHash(expiredSecret.hash())).isEmpty();
        assertThat(refreshTokens.findBySecretHash(recentlyRevokedSecret.hash())).isPresent();
        assertThat(refreshTokens.findBySecretHash(usedSecret.hash())).isPresent();
        assertThat(refreshTokens.findBySecretHash(liveSecret.hash())).isPresent();
    }

    @Test
    @DisplayName("Given a device signed in with a device secret, when it is found by the secret's hash, then it is that device, and another hash finds none")
    void should_find_device_when_found_by_hash_given_device_secret() {
        DeviceStatusSecret secret = DeviceStatusSecret.generate();
        DonorDevice phone = DonorDevice.signIn(jana, IPHONE_SAFARI, SessionKind.APP, NOW, secret);
        devices.save(phone);
        devices.save(DonorDevice.signIn(jana, IPHONE_SAFARI, SessionKind.APP, NOW));
        flushAndClear();

        DonorDevice found = devices.findByStatusSecretHash(secret.hash()).orElseThrow();

        assertThat(found.id()).isEqualTo(phone.id());
        assertThat(found.statusSecretHash()).contains(secret.hash());
        assertThat(found.wipe()).isEmpty();
        assertThat(devices.findByStatusSecretHash(DeviceStatusSecret.generate().hash())).isEmpty();
    }

    @Test
    @DisplayName("Given a device told to delete everything, when it is told to delete the administration's copy, then it keeps the order to delete everything")
    void should_keep_full_wipe_when_told_administration_wipe_given_full_wipe() {
        DonorDevice phone = DonorDevice.signIn(jana, IPHONE_SAFARI, SessionKind.APP, NOW, DeviceStatusSecret.generate());
        DonorDevice laptop = DonorDevice.signIn(jana, IPHONE_SAFARI, SessionKind.APP, NOW, DeviceStatusSecret.generate());
        devices.save(phone);
        devices.save(laptop);
        flushAndClear();

        devices.directWipe(phone.id(), DeviceWipe.ALL);
        devices.directWipe(phone.id(), DeviceWipe.ADMINISTRATION);
        devices.directWipe(laptop.id(), DeviceWipe.ADMINISTRATION);
        devices.directWipe(laptop.id(), DeviceWipe.ALL);
        flushAndClear();

        assertThat(devices.findById(phone.id()).orElseThrow().wipe()).contains(DeviceWipe.ALL);
        assertThat(devices.findById(laptop.id()).orElseThrow().wipe()).contains(DeviceWipe.ALL);
    }

    @Test
    @DisplayName("Given devices of two donors, one told to delete everything, when one donor's devices are told to delete the administration's copy, then only theirs change and the full order stays")
    void should_change_only_that_donors_devices_when_told_administration_wipe_given_two_donors() {
        DonorDevice told = DonorDevice.signIn(jana, IPHONE_SAFARI, SessionKind.APP, NOW, DeviceStatusSecret.generate());
        DonorDevice ended = DonorDevice.signIn(jana, IPHONE_SAFARI, SessionKind.APP, NOW, DeviceStatusSecret.generate());
        ended.end(DeviceSignOutReason.SIGNED_OUT, NOW);
        DonorDevice petrs = DonorDevice.signIn(petr, IPHONE_SAFARI, SessionKind.APP, NOW, DeviceStatusSecret.generate());
        devices.save(told);
        devices.save(ended);
        devices.save(petrs);
        flushAndClear();
        devices.directWipe(told.id(), DeviceWipe.ALL);

        devices.directWipeOfDonor(jana, DeviceWipe.ADMINISTRATION);
        flushAndClear();

        assertThat(devices.findById(told.id()).orElseThrow().wipe()).contains(DeviceWipe.ALL);
        assertThat(devices.findById(ended.id()).orElseThrow().wipe()).contains(DeviceWipe.ADMINISTRATION);
        assertThat(devices.findById(petrs.id()).orElseThrow().wipe()).isEmpty();
    }

    @Test
    @DisplayName("Given a device told to delete, when it is saved again after a later use, then its order and its secret's hash stay as stored")
    void should_keep_order_and_hash_when_saved_after_use_given_wipe() {
        DeviceStatusSecret secret = DeviceStatusSecret.generate();
        DonorDevice phone = DonorDevice.signIn(jana, IPHONE_SAFARI, SessionKind.APP, NOW, secret);
        devices.save(phone);
        flushAndClear();
        DonorDevice read = devices.findById(phone.id()).orElseThrow();
        devices.directWipe(phone.id(), DeviceWipe.ALL);
        flushAndClear();

        read.recordUse(NOW.plusSeconds(60));
        devices.save(read);
        flushAndClear();

        DonorDevice found = devices.findById(phone.id()).orElseThrow();
        assertThat(found.wipe()).contains(DeviceWipe.ALL);
        assertThat(found.statusSecretHash()).contains(secret.hash());
        assertThat(found.lastUsedAt()).isEqualTo(NOW.plusSeconds(60));
    }

    @Test
    @DisplayName("Given an erased donor's devices and another donor's, when the erased donor's are reduced, then theirs keep only ids, the secret's hash and the order to delete everything, and the other's stays")
    void should_reduce_only_erased_donors_devices_when_reduced_given_two_donors() {
        DeviceStatusSecret secret = DeviceStatusSecret.generate();
        DonorDevice phone = DonorDevice.signIn(jana, IPHONE_SAFARI, SessionKind.APP, NOW, secret);
        phone.recordUse(NOW.plusSeconds(600));
        DonorDevice petrs = DonorDevice.signIn(petr, IPHONE_SAFARI, SessionKind.APP, NOW);
        devices.save(phone);
        devices.save(petrs);
        flushAndClear();
        Instant erasedAt = NOW.plusSeconds(3600);

        devices.reduceErasedOf(jana, erasedAt);
        flushAndClear();

        DonorDevice reduced = devices.findById(phone.id()).orElseThrow();
        assertThat(reduced.description()).isEqualTo(DeviceDescription.UNKNOWN);
        assertThat(reduced.kind()).isEqualTo(SessionKind.UNNAMED);
        assertThat(reduced.signedInAt()).isEqualTo(erasedAt);
        assertThat(reduced.lastUsedAt()).isEqualTo(erasedAt);
        assertThat(reduced.endedAt()).contains(erasedAt);
        assertThat(reduced.endReason()).contains(DeviceSignOutReason.ERASED);
        assertThat(reduced.wipe()).contains(DeviceWipe.ALL);
        assertThat(reduced.statusSecretHash()).contains(secret.hash());
        DonorDevice untouched = devices.findById(petrs.id()).orElseThrow();
        assertThat(untouched.description()).isEqualTo(IPHONE_SAFARI);
        assertThat(untouched.isActive()).isTrue();
        assertThat(untouched.wipe()).isEmpty();
    }

    private DonorDevice deviceWithToken(DonorId donor, Instant issuedAt, Duration lifetime) {
        DonorDevice device = DonorDevice.signIn(donor, IPHONE_SAFARI, SessionKind.REMEMBERED, issuedAt);
        devices.save(device);
        refreshTokens.save(RefreshToken.issue(RefreshTokenSecret.generate(), donor, device.id(), issuedAt, lifetime, false));
        return device;
    }

    private RefreshTokenSecret legacyBrowserToken(DonorId donor) {
        RefreshTokenSecret secret = RefreshTokenSecret.generate();
        RefreshToken withDevice = RefreshToken.issue(secret, donor, DonorDevice.signIn(donor, IPHONE_SAFARI, SessionKind.REMEMBERED, NOW).id(), NOW, TTL, false);
        refreshTokens.save(RefreshToken.reconstitute(withDevice.id(), withDevice.donorId(), withDevice.secretHash(), withDevice.issuedAt(),
                withDevice.expiresAt(), false, null, Set.of(), withDevice.grantedAt(), null, null, null, null, null));
        return secret;
    }

    private RefreshTokenSecret browserToken(DonorDevice device) {
        RefreshTokenSecret secret = RefreshTokenSecret.generate();
        refreshTokens.save(RefreshToken.issue(secret, device.donorId(), device.id(), NOW, TTL, false));
        return secret;
    }

    private RefreshTokenSecret connectorToken(DonorId donor) {
        RefreshTokenSecret secret = RefreshTokenSecret.generate();
        refreshTokens.save(RefreshToken.issueForClient(secret, donor, CLAUDE, Set.of(OAuthScope.ADMIN_READ), NOW, NOW, TTL));
        return secret;
    }

    private RefreshTokenSecret token(DonorDevice device, Instant issuedAt, Instant usedAt, Instant revokedAt) {
        RefreshTokenSecret secret = RefreshTokenSecret.generate();
        RefreshToken token = RefreshToken.issue(secret, device.donorId(), device.id(), issuedAt, TTL, false);
        if (usedAt != null) {
            token.markUsed(usedAt);
        }
        if (revokedAt != null) {
            token.revoke(revokedAt);
        }
        refreshTokens.save(token);
        return secret;
    }

    private boolean revoked(RefreshTokenSecret secret) {
        return refreshTokens.findBySecretHash(secret.hash()).orElseThrow().isRevoked();
    }

    private DonorId donor(String email, String variableSymbol) {
        Donor donor = Donor.register(DonorId.newId(NOW), DonorType.PERSON, "Jana Nováková", null,
                new PostalAddress("Dlouhá 12", "Ústí nad Labem", "400 01"), new EmailAddress(email), new PasswordHash("$hash"),
                new VariableSymbol(variableSymbol), LocaleCode.CS, NOW);
        donors.save(donor);
        return donor.id();
    }

    private void flushAndClear() {
        entityManager.flush();
        entityManager.clear();
    }
}
