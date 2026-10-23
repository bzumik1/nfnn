package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.ClientId;
import cz.novanadeje.app.donors.domain.ConnectedAppNotFound;
import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.RefreshToken;
import cz.novanadeje.app.donors.domain.RefreshTokenRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
public class ConnectedAppsService {

    private static final Logger log = LoggerFactory.getLogger(ConnectedAppsService.class);

    private final RefreshTokenRepository refreshTokens;
    private final Clock clock;

    public ConnectedAppsService(RefreshTokenRepository refreshTokens, Clock clock) {
        this.refreshTokens = refreshTokens;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<ConnectedAppView> list(DonorId donorId) {
        return refreshTokens.findUsableClientTokensOf(donorId, clock.instant()).stream().map(ConnectedAppsService::view).toList();
    }

    @Transactional
    public void disconnect(DonorId donorId, UUID id) {
        Instant now = clock.instant();
        RefreshToken token = refreshTokens.findById(id)
                .filter(found -> found.donorId().equals(donorId) && found.clientId().isPresent() && found.isUsableAt(now))
                .orElseThrow(() -> new ConnectedAppNotFound(id));
        token.revoke(now);
        refreshTokens.save(token);
        log.info("Donor {} disconnected client {}", donorId, token.clientId().map(ClientId::host).orElse("?"));
    }

    private static ConnectedAppView view(RefreshToken token) {
        return new ConnectedAppView(token.id(), token.clientId().map(ClientId::host).orElse(""), token.scopes(), token.grantedAt(), token.issuedAt(),
                token.expiresAt());
    }
}
