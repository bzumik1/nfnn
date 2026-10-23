package cz.novanadeje.app.donors.interfaces.rest;

import cz.novanadeje.app.donors.application.OAuthProperties;
import cz.novanadeje.app.donors.domain.OAuthScope;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Arrays;
import java.util.List;

@RestController
class OAuthMetadataController {

    static final String TOKEN_PATH = "/api/donors/oauth/token";

    private final OAuthProperties properties;

    OAuthMetadataController(OAuthProperties properties) {
        this.properties = properties;
    }

    @GetMapping("/.well-known/oauth-authorization-server")
    AuthorizationServerMetadata metadata() {
        return new AuthorizationServerMetadata(
                properties.issuer(),
                properties.authorizationEndpoint(),
                properties.issuer() + TOKEN_PATH,
                Arrays.stream(OAuthScope.values()).map(OAuthScope::value).toList(),
                List.of("code"),
                List.of(OAuthController.AUTHORIZATION_CODE, OAuthController.REFRESH_TOKEN, OAuthController.TOKEN_EXCHANGE),
                List.of("none"),
                List.of("S256"),
                true,
                true);
    }
}
