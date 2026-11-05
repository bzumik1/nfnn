package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.Donor;
import cz.novanadeje.app.donors.domain.DonorId;
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
    private final DonorRepository donors;
    private final AccessTokenIssuer accessTokens;
    private final DonorSessionProperties properties;
    private final Clock clock;

    public DonorSessionService(RefreshTokenRepository refreshTokens, DonorRepository donors, AccessTokenIssuer accessTokens,
                               DonorSessionProperties properties, Clock clock) {
        this.refreshTokens = refreshTokens;
        this.donors = donors;
        this.accessTokens = accessTokens;
        this.properties = properties;
        this.clock = clock;
    }

    @Transactional
    public IssuedTokens signIn(Donor donor, boolean secondFactorVerified) {
        Instant now = clock.instant();
        Set<Role> roles = donor.sessionRoles(secondFactorVerified);
        if (roles.contains(Role.ADMIN)) {
            donors.recordSignIn(donor.id(), now);
        }
        return issue(donor.id(), roles, secondFactorVerified, now).tokens();
    }

    @Transactional
    public IssuedTokens open(Donor donor, boolean secondFactorVerified) {
        return issue(donor.id(), donor.sessionRoles(secondFactorVerified), secondFactorVerified, clock.instant()).tokens();
    }

    @Transactional(noRollbackFor = InvalidRefreshToken.class)
    public RefreshedSession refresh(String presentedSecret) {
        Instant now = clock.instant();
        RefreshToken token = refreshTokens.findBySecretHashForUpdate(RefreshTokenSecret.fromValue(presentedSecret).hash())
                .orElseThrow(InvalidRefreshToken::new);
        if (token.isSuperseded()) {
            throw replay(token, now);
        }
        if (token.isUsed()) {
            return reissueWithinReuseGrace(token, now);
        }
        if (!token.isUsableAt(now) || token.clientId().isPresent()) {
            throw new InvalidRefreshToken();
        }
        Donor donor = donors.findById(token.donorId()).orElseThrow(InvalidRefreshToken::new);
        if (!refreshTokens.markUsed(token.id(), now)) {
            throw replay(token, now);
        }
        return succeed(token, donor, now);
    }

    private RefreshedSession reissueWithinReuseGrace(RefreshToken token, Instant now) {
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
        return succeed(token, donor.get(), now);
    }

    private InvalidRefreshToken replay(RefreshToken token, Instant now) {
        refreshTokens.revokeAllOf(token.donorId(), now);
        return new InvalidRefreshToken();
    }

    private RefreshedSession succeed(RefreshToken token, Donor donor, Instant now) {
        Issued successor = issue(donor.id(), donor.sessionRoles(token.secondFactorVerified()), token.secondFactorVerified(), now);
        refreshTokens.recordSuccessor(token.id(), successor.refreshTokenId());
        return new RefreshedSession(donor, successor.tokens());
    }

    @Transactional
    public void close(String presentedSecret) {
        Instant now = clock.instant();
        refreshTokens.findBySecretHashForUpdate(RefreshTokenSecret.fromValue(presentedSecret).hash()).ifPresent(token -> {
            if (token.isSuperseded()) {
                refreshTokens.revokeAllOf(token.donorId(), now);
                return;
            }
            refreshTokens.revokeIfUnused(token.id(), now);
            token.successorId().ifPresent(successor -> refreshTokens.revokeIfUnused(successor, now));
        });
    }

    private Issued issue(DonorId donorId, Set<Role> roles, boolean secondFactorVerified, Instant now) {
        IssuedAccessToken access = accessTokens.issue(donorId, roles, now);
        RefreshTokenSecret secret = RefreshTokenSecret.generate();
        RefreshToken refresh = RefreshToken.issue(secret, donorId, now, properties.refreshTokenTtl(), secondFactorVerified);
        refreshTokens.save(refresh);
        return new Issued(refresh.id(), new IssuedTokens(access.token(), access.expiresAt(), secret.value(), refresh.expiresAt(), roles));
    }

    private record Issued(UUID refreshTokenId, IssuedTokens tokens) {
    }
}
