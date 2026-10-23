package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.donors.domain.ClientId;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;
import java.util.List;
import java.util.Locale;

@ConfigurationProperties("app.donors.oauth")
public record OAuthProperties(String issuer, String authorizationPath, Duration authorizationCodeTtl, String mcpResource, String apiResource,
                              List<String> allowedClientHosts) {

    private static final String PREFIX = "app.donors.oauth.";

    public OAuthProperties {
        issuer = requireAddress("issuer", issuer);
        if (authorizationPath == null || !authorizationPath.startsWith("/")) {
            throw new IllegalArgumentException(PREFIX + "authorization-path must start with '/', but is '" + authorizationPath + "'");
        }
        if (authorizationCodeTtl == null || authorizationCodeTtl.isZero() || authorizationCodeTtl.isNegative()) {
            throw new IllegalArgumentException(PREFIX + "authorization-code-ttl must be a positive duration, but is " + authorizationCodeTtl);
        }
        mcpResource = requireAddress("mcp-resource", mcpResource);
        apiResource = requireAddress("api-resource", apiResource);
        allowedClientHosts = allowedClientHosts == null ? List.of()
                : allowedClientHosts.stream().map(host -> host.strip().toLowerCase(Locale.ROOT)).filter(host -> !host.isEmpty()).toList();
    }

    public boolean allowsClient(ClientId clientId) {
        return allowedClientHosts.isEmpty() || allowedClientHosts.contains(clientId.host().toLowerCase(Locale.ROOT));
    }

    public String authorizationEndpoint() {
        return issuer + authorizationPath;
    }

    private static String requireAddress(String name, String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(PREFIX + name + " is required");
        }
        String trimmed = value.trim();
        if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
            throw new IllegalArgumentException(PREFIX + name + " must start with http:// or https://, but is '" + trimmed + "'");
        }
        return trimmed.endsWith("/") ? trimmed.substring(0, trimmed.length() - 1) : trimmed;
    }
}
