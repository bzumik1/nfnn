package cz.novanadeje.app.donors.domain;

import java.net.URI;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;

public record ClientMetadata(ClientId clientId, String clientName, List<URI> redirectUris) {

    public static final int MAX_REDIRECT_LENGTH = 2048;
    private static final Set<String> LOOPBACK_HOSTS = Set.of("localhost", "127.0.0.1", "[::1]");

    public ClientMetadata {
        redirectUris = List.copyOf(redirectUris);
        redirectUris.forEach(ClientMetadata::requireRegistrable);
    }

    public boolean allowsRedirect(URI redirectUri) {
        if (redirectUri == null || !redirectUri.isAbsolute() || redirectUri.getHost() == null) {
            return false;
        }
        return redirectUris.stream().anyMatch(registered -> matches(registered, redirectUri));
    }

    public String displayName() {
        return clientName == null || clientName.isBlank() ? clientId.host() : clientName.trim();
    }

    public static boolean isLoopback(URI uri) {
        return uri.getHost() != null && LOOPBACK_HOSTS.contains(uri.getHost().toLowerCase(Locale.ROOT));
    }

    private static boolean matches(URI registered, URI requested) {
        if (isLoopback(registered) && isLoopback(requested)) {
            return registered.getScheme().equals(requested.getScheme())
                    && registered.getHost().equalsIgnoreCase(requested.getHost())
                    && registered.getRawPath().equals(requested.getRawPath())
                    && Objects.equals(registered.getRawQuery(), requested.getRawQuery());
        }
        return registered.equals(requested);
    }

    private static void requireRegistrable(URI redirectUri) {
        if (!redirectUri.isAbsolute() || redirectUri.getHost() == null) {
            throw new InvalidClient("a redirect address must be absolute and name a host");
        }
        if (redirectUri.getRawFragment() != null) {
            throw new InvalidClient("a redirect address must carry no fragment");
        }
        boolean secure = "https".equals(redirectUri.getScheme());
        boolean loopback = "http".equals(redirectUri.getScheme()) && isLoopback(redirectUri);
        if (!secure && !loopback) {
            throw new InvalidClient("a redirect address must use https or the loopback address");
        }
    }
}
