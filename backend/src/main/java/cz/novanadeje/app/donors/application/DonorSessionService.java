package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.DeviceDescription;
import cz.novanadeje.app.donors.domain.DeviceSignOutReason;
import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorDevice;
import cz.novanadeje.app.donors.domain.DonorDeviceRepository;
import cz.novanadeje.app.donors.domain.DonorRepository;
import cz.novanadeje.app.donors.domain.InvalidRefreshToken;
import cz.novanadeje.app.donors.domain.RefreshToken;
import cz.novanadeje.app.donors.domain.RefreshTokenRepository;
import cz.novanadeje.app.donors.domain.RefreshTokenSecret;
import cz.novanadeje.app.donors.domain.Role;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
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
    private final Clock clock;

    public DonorSessionService(RefreshTokenRepository refreshTokens, DonorDeviceRepository devices, DeviceSignOuts signOuts, DonorRepository donors,
                               AccessTokenIssuer accessTokens, DonorSessionProperties properties, Clock clock) {
        this.refreshTokens = refreshTokens;
        this.devices = devices;
        this.signOuts = signOuts;
        this.donors = donors;
        this.accessTokens = accessTokens;
        this.properties = properties;
        this.clock = clock;
    }

    @Transactional
    public IssuedTokens signIn(Donor donor, boolean secondFactorVerified, DeviceDescription description) {
        Instant now = clock.instant();
        Set<Role> roles = donor.sessionRoles(secondFactorVerified);
        if (roles.contains(Role.ADMIN)) {
            donors.recordSignIn(donor.id(), now);
        }
        return issue(newDevice(donor, description, now), secondFactorVerified, roles, now).tokens();
    }

    @Transactional
    public IssuedTokens open(Donor donor, boolean secondFactorVerified, DeviceDescription description) {
        Instant now = clock.instant();
        return issue(newDevice(donor, description, now), secondFactorVerified, donor.sessionRoles(secondFactorVerified), now)
                .tokens();
    }

    @Transactional
    public IssuedTokens continueOn(Donor donor, boolean secondFactorVerified, RequestingDevice requesting) {
        Instant now = clock.instant();
        DonorDevice device = requesting.session().flatMap(devices::findById)
                .filter(found -> found.isActive() && found.belongsTo(donor.id()))
                .map(found -> {
                    found.recordUse(now);
                    devices.save(found);
                    return found;
                })
                .orElseGet(() -> newDevice(donor, requesting.description(), now));
        return issue(device, secondFactorVerified, donor.sessionRoles(secondFactorVerified), now).tokens();
    }

    @Transactional(noRollbackFor = InvalidRefreshToken.class)
    public RefreshedSession refresh(String presentedSecret, DeviceDescription description) {
        Instant now = clock.instant();
        RefreshToken token = refreshTokens.findBySecretHashForUpdate(RefreshTokenSecret.fromValue(presentedSecret).hash())
                .orElseThrow(InvalidRefreshToken::new);
        if (token.isSuperseded()) {
            throw replay(token, now);
        }
        if (token.isUsed()) {
            return reissueWithinReuseGrace(token, description, now);
        }
        if (!token.isUsableAt(now) || token.clientId().isPresent()) {
            throw new InvalidRefreshToken();
        }
        Donor donor = donors.findById(token.donorId()).orElseThrow(InvalidRefreshToken::new);
        if (!refreshTokens.markUsed(token.id(), now)) {
            throw replay(token, now);
        }
        return succeed(token, donor, description, now);
    }

    private RefreshedSession reissueWithinReuseGrace(RefreshToken token, DeviceDescription description, Instant now) {
        if (!token.mayBeReissuedAt(now)) {
            throw replay(token, now);
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

    private DonorDevice deviceOf(RefreshToken token, Donor donor, DeviceDescription description, Instant now) {
        if (token.deviceId().isEmpty()) {
            return DonorDevice.signIn(donor.id(), description, token.issuedAt());
        }
        return token.deviceId().flatMap(devices::findById).filter(DonorDevice::isActive).orElseThrow(InvalidRefreshToken::new);
    }

    @Transactional
    public void close(String presentedSecret) {
        Instant now = clock.instant();
        refreshTokens.findBySecretHashForUpdate(RefreshTokenSecret.fromValue(presentedSecret).hash()).ifPresent(token -> {
            if (token.isSuperseded()) {
                signOuts.endAllOf(token.donorId(), DeviceSignOutReason.REPLAY, now);
                return;
            }
            refreshTokens.revokeIfUnused(token.id(), now);
            token.successorId().ifPresent(successor -> refreshTokens.revokeIfUnused(successor, now));
            token.deviceId().flatMap(devices::findById).filter(device -> device.belongsTo(token.donorId()))
                    .ifPresent(device -> signOuts.end(device, DeviceSignOutReason.SIGNED_OUT, now));
        });
    }

    private DonorDevice newDevice(Donor donor, DeviceDescription description, Instant now) {
        DonorDevice device = DonorDevice.signIn(donor.id(), description, now);
        devices.save(device);
        return device;
    }

    private Issued issue(DonorDevice device, boolean secondFactorVerified, Set<Role> roles, Instant now) {
        IssuedAccessToken access = accessTokens.issue(device.donorId(), roles, device.id(), now);
        RefreshTokenSecret secret = RefreshTokenSecret.generate();
        RefreshToken refresh = RefreshToken.issue(secret, device.donorId(), device.id(), now, properties.refreshTokenTtl(),
                secondFactorVerified);
        refreshTokens.save(refresh);
        return new Issued(refresh.id(), new IssuedTokens(access.token(), access.expiresAt(), secret.value(), refresh.expiresAt(), roles));
    }

    private record Issued(UUID refreshTokenId, IssuedTokens tokens) {
    }
}
