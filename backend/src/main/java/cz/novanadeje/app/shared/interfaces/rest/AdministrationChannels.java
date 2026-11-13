package cz.novanadeje.app.shared.interfaces.rest;

import cz.novanadeje.app.shared.application.administration.AdministrationChannel;
import cz.novanadeje.app.shared.infrastructure.security.JwtProperties;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

final class AdministrationChannels {

    private AdministrationChannels() {
    }

    static AdministrationChannel of(Authentication authentication) {
        boolean connected = authentication instanceof JwtAuthenticationToken token && token.getToken().getClaimAsString(JwtProperties.SCOPE_CLAIM) != null;
        return connected ? AdministrationChannel.CONNECTED_APPLICATION : AdministrationChannel.BROWSER;
    }
}
