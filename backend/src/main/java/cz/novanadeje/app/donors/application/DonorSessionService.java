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
import java.util.Set;

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
    public IssuedTokens open(Donor donor, boolean secondFactorVerified) {
        return issue(donor.id(), donor.sessionRoles(secondFactorVerified), secondFactorVerified, clock.instant());
    }

    @Transactional(noRollbackFor = InvalidRefreshToken.class)
    public RefreshedSession refresh(String presentedSecret) {
        Instant now = clock.instant();
        RefreshToken token = refreshTokens.findBySecretHash(RefreshTokenSecret.fromValue(presentedSecret).hash())
                .orElseThrow(InvalidRefreshToken::new);
        if (token.isUsed()) {
            refreshTokens.revokeAllOf(token.donorId(), now);
            throw new InvalidRefreshToken();
        }
        if (!token.isUsableAt(now) || token.clientId().isPresent()) {
            throw new InvalidRefreshToken();
        }
        Donor donor = donors.findById(token.donorId()).orElseThrow(InvalidRefreshToken::new);
        token.markUsed(now);
        refreshTokens.save(token);
        return new RefreshedSession(donor, issue(donor.id(), donor.sessionRoles(token.secondFactorVerified()), token.secondFactorVerified(), now));
    }

    @Transactional
    public void close(String presentedSecret) {
        refreshTokens.findBySecretHash(RefreshTokenSecret.fromValue(presentedSecret).hash()).ifPresent(token -> {
            token.revoke(clock.instant());
            refreshTokens.save(token);
        });
    }

    private IssuedTokens issue(DonorId donorId, Set<Role> roles, boolean secondFactorVerified, Instant now) {
        IssuedAccessToken access = accessTokens.issue(donorId, roles, now);
        RefreshTokenSecret secret = RefreshTokenSecret.generate();
        RefreshToken refresh = RefreshToken.issue(secret, donorId, now, properties.refreshTokenTtl(), secondFactorVerified);
        refreshTokens.save(refresh);
        return new IssuedTokens(access.token(), access.expiresAt(), secret.value(), refresh.expiresAt(), roles);
    }
}
