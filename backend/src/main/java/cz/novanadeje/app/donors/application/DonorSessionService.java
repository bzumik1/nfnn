package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.DeviceDescription;
import cz.novanadeje.app.donors.domain.DeviceId;
import cz.novanadeje.app.donors.domain.DeviceSignOutReason;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorDevice;
import cz.novanadeje.app.donors.domain.DonorDeviceRepository;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.InvalidRefreshToken;
import cz.novanadeje.app.donors.domain.RefreshToken;
import cz.novanadeje.app.donors.domain.RefreshTokenRepository;
import cz.novanadeje.app.donors.domain.SessionEnded;
import cz.novanadeje.app.donors.domain.RefreshTokenSecret;
import cz.novanadeje.app.donors.domain.Role;
import cz.novanadeje.app.donors.domain.SessionKind;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionOperations;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

@Service
public class DonorSessionService {

    private final RefreshTokenRepository refreshTokens;
    private final DonorDeviceRepository devices;
    private final DeviceSignOuts signOuts;
    private final DonorRepository donors;
    private final AccessTokenIssuer accessTokens;
    private final DonorSessionProperties properties;
    private final TransactionOperations transactions;
    private final Clock clock;

    public DonorSessionService(RefreshTokenRepository refreshTokens, DonorDeviceRepository devices, DeviceSignOuts signOuts, DonorRepository donors,
                               AccessTokenIssuer accessTokens, DonorSessionProperties properties, TransactionOperations transactions, Clock clock) {
        this.refreshTokens = refreshTokens;
        this.devices = devices;
        this.signOuts = signOuts;
        this.donors = donors;
        this.accessTokens = accessTokens;
        this.properties = properties;
        this.transactions = transactions;
        this.clock = clock;
    }

    @Transactional
    public IssuedTokens signIn(Donor donor, boolean secondFactorVerified, DeviceDescription description, SessionKind kind) {
        Instant now = clock.instant();
        Set<Role> roles = donor.sessionRoles(secondFactorVerified);
        if (roles.contains(Role.ADMIN)) {
            donors.recordSignIn(donor.id(), now);
        }
        return issue(newDevice(donor, description, kind, now), secondFactorVerified, roles, now).tokens();
    }

    @Transactional(readOnly = true)
    public void requireLasting(Donor donor, RequestingDevice requesting) {
        lastingDevice(donor, requesting, clock.instant());
    }

    @Transactional
    public IssuedTokens continueOn(Donor donor, boolean secondFactorVerified, RequestingDevice requesting) {
        Instant now = clock.instant();
        DonorDevice device = lastingDevice(donor, requesting, now)
                .map(found -> {
                    found.recordUse(now);
                    devices.save(found);
                    return found;
                })
                .orElseGet(() -> newDevice(donor, requesting.description(), SessionKind.BROWSER, now));
        return issue(device, secondFactorVerified, donor.sessionRoles(secondFactorVerified), now).tokens();
    }

    public RefreshedSession refresh(String presentedSecret, SessionCookie presentedIn, DeviceDescription description) {
        String secretHash = RefreshTokenSecret.fromValue(presentedSecret).hash();
        RefreshAttempt attempt = attempt(secretHash, presentedIn, description, SessionsLock.NOT_HELD);
        if (attempt instanceof RefreshAttempt.NeedsSessionsLock) {
            attempt = attempt(secretHash, presentedIn, description, SessionsLock.HELD);
        }
        return switch (attempt) {
            case RefreshAttempt.Refreshed(RefreshedSession session) -> session;
            case RefreshAttempt.Refused(InvalidRefreshToken refusal) -> throw refusal;
            case RefreshAttempt.NeedsSessionsLock() -> throw new IllegalStateException("a refresh under the donor's sessions lock asked for it again");
        };
    }

    private RefreshAttempt attempt(String secretHash, SessionCookie presentedIn, DeviceDescription description, SessionsLock lock) {
        return transactions.execute(status -> {
            try {
                RefreshAttempt attempt = refresh(secretHash, presentedIn, description, lock);
                if (attempt instanceof RefreshAttempt.NeedsSessionsLock) {
                    status.setRollbackOnly();
                }
                return attempt;
            } catch (InvalidRefreshToken refusal) {
                return new RefreshAttempt.Refused(refusal);
            }
        });
    }

    private RefreshAttempt refresh(String secretHash, SessionCookie presentedIn, DeviceDescription description, SessionsLock lock) {
        Instant now = clock.instant();
        if (lock == SessionsLock.HELD) {
            refreshTokens.findDonorOfSecretHash(secretHash).ifPresent(refreshTokens::lockSessionsOf);
        }
        RefreshToken token = refreshTokens.findBySecretHashForUpdate(secretHash).orElseThrow(InvalidRefreshToken::new);
        if (lock == SessionsLock.NOT_HELD && (token.isSuperseded() || token.isUsed())) {
            return new RefreshAttempt.NeedsSessionsLock();
        }
        if (token.isSuperseded()) {
            throw replay(token, now);
        }
        if (token.isUsed()) {
            return new RefreshAttempt.Refreshed(reissueWithinReuseGrace(token, presentedIn, description, now));
        }
        if (!token.isUsableAt(now) || token.clientId().isPresent() || deviceEnded(token) || !presentedInItsCookie(token, presentedIn)) {
            throw new InvalidRefreshToken();
        }
        Donor donor = donors.findById(token.donorId()).orElseThrow(InvalidRefreshToken::new);
        if (!refreshTokens.markUsed(token.id(), now)) {
            if (lock == SessionsLock.NOT_HELD) {
                return new RefreshAttempt.NeedsSessionsLock();
            }
            throw replay(token, now);
        }
        return new RefreshAttempt.Refreshed(succeed(token, donor, description, now));
    }

    private RefreshedSession reissueWithinReuseGrace(RefreshToken token, SessionCookie presentedIn, DeviceDescription description, Instant now) {
        if (usedWithinReuseGrace(token, now) && deviceEnded(token)) {
            throw new InvalidRefreshToken();
        }
        if (!token.mayBeReissuedAt(now)) {
            throw replay(token, now);
        }
        if (!presentedInItsCookie(token, presentedIn)) {
            throw new InvalidRefreshToken();
        }
        Optional<Donor> donor = donors.findById(token.donorId());
        boolean supersededUnused = donor.isPresent() && token.successorId()
                .map(successor -> refreshTokens.supersedeIfUnused(successor, now))
                .orElse(false);
        if (!supersededUnused) {
            throw replay(token, now);
        }
        return succeed(token, donor.get(), description, now);
    }

    private InvalidRefreshToken replay(RefreshToken token, Instant now) {
        signOuts.endAllOf(token.donorId(), DeviceSignOutReason.REPLAY, now);
        return new InvalidRefreshToken();
    }

    private RefreshedSession succeed(RefreshToken token, Donor donor, DeviceDescription description, Instant now) {
        DonorDevice device = deviceOf(token, donor, description, now);
        device.recordUse(now);
        devices.save(device);
        Issued successor = issue(device, token.secondFactorVerified(), donor.sessionRoles(token.secondFactorVerified()), now);
        refreshTokens.recordSuccessor(token.id(), successor.refreshTokenId());
        return new RefreshedSession(donor, successor.tokens());
    }

    private static boolean usedWithinReuseGrace(RefreshToken token, Instant now) {
        return token.usedAt().filter(used -> now.isBefore(used.plus(RefreshToken.REUSE_GRACE))).isPresent();
    }

    private boolean deviceEnded(RefreshToken token) {
        return deviceIdOf(token).flatMap(devices::findById).filter(device -> !device.isActive()).isPresent();
    }

    private boolean presentedInItsCookie(RefreshToken token, SessionCookie presentedIn) {
        SessionKind kind = deviceIdOf(token).flatMap(devices::findById).map(DonorDevice::kind).orElse(SessionKind.UNNAMED);
        return SessionCookie.of(kind) == presentedIn;
    }

    private Optional<DeviceId> deviceIdOf(RefreshToken token) {
        return token.deviceId().or(() -> token.successorId().flatMap(refreshTokens::findById).flatMap(RefreshToken::deviceId));
    }

    private DonorDevice deviceOf(RefreshToken token, Donor donor, DeviceDescription description, Instant now) {
        Optional<DeviceId> deviceId = deviceIdOf(token);
        if (deviceId.isEmpty()) {
            return DonorDevice.signIn(donor.id(), description, SessionKind.UNNAMED, token.issuedAt());
        }
        return deviceId.flatMap(devices::findById).filter(device -> device.isActive() && device.belongsTo(donor.id()))
                .orElseThrow(InvalidRefreshToken::new);
    }

    @Transactional
    public void close(String presentedSecret) {
        Instant now = clock.instant();
        String secretHash = RefreshTokenSecret.fromValue(presentedSecret).hash();
        refreshTokens.findDonorOfSecretHash(secretHash).ifPresent(refreshTokens::lockSessionsOf);
        refreshTokens.findBySecretHashForUpdate(secretHash).ifPresent(token -> {
            if (token.isSuperseded()) {
                signOuts.endAllOf(token.donorId(), DeviceSignOutReason.REPLAY, now);
                return;
            }
            refreshTokens.revokeIfUnused(token.id(), now);
            token.successorId().ifPresent(successor -> refreshTokens.revokeIfUnused(successor, now));
            token.deviceId().ifPresent(device -> signOuts.end(token.donorId(), device, DeviceSignOutReason.SIGNED_OUT, now));
        });
    }

    private Optional<DonorDevice> lastingDevice(Donor donor, RequestingDevice requesting, Instant now) {
        Optional<DonorDevice> own = requesting.session().flatMap(devices::findById).filter(found -> found.belongsTo(donor.id()));
        if (own.isPresent() && !lasts(own.get(), now)) {
            throw new SessionEnded();
        }
        return own;
    }

    private boolean lasts(DonorDevice device, Instant now) {
        return device.isActive() && properties.lengths().expiresAt(device.kind(), device.signedInAt(), now).isAfter(now);
    }

    private DonorDevice newDevice(Donor donor, DeviceDescription description, SessionKind kind, Instant now) {
        DonorDevice device = DonorDevice.signIn(donor.id(), description, kind, now);
        devices.save(device);
        return device;
    }

    private Issued issue(DonorDevice device, boolean secondFactorVerified, Set<Role> roles, Instant now) {
        IssuedAccessToken access = accessTokens.issue(device.donorId(), roles, device.id(), now);
        RefreshTokenSecret secret = RefreshTokenSecret.generate();
        Instant expiresAt = properties.lengths().expiresAt(device.kind(), device.signedInAt(), now);
        RefreshToken refresh = RefreshToken.issue(secret, device.donorId(), device.id(), now, Duration.between(now, expiresAt),
                secondFactorVerified);
        refreshTokens.save(refresh);
        return new Issued(refresh.id(), new IssuedTokens(access.token(), access.expiresAt(), secret.value(), refresh.expiresAt(), roles,
                device.kind()));
    }

    private record Issued(UUID refreshTokenId, IssuedTokens tokens) {
    }

    private enum SessionsLock {
        NOT_HELD, HELD
    }

    private sealed interface RefreshAttempt {

        record Refreshed(RefreshedSession session) implements RefreshAttempt {
        }

        record Refused(InvalidRefreshToken refusal) implements RefreshAttempt {
        }

        record NeedsSessionsLock() implements RefreshAttempt {
        }
    }
}
