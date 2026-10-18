package cz.novanadeje.app.shared.infrastructure.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.net.URI;
import java.util.Locale;
import java.util.Set;

@ConfigurationProperties("app.site")
public record PublicUrlProperties(String publicUrl) {

    private static final String NAME = "PUBLIC_URL (app.site.public-url)";
    private static final Set<String> SCHEMES = Set.of("http", "https");

    public PublicUrlProperties {
        if (publicUrl == null || publicUrl.isBlank()) {
            throw new IllegalArgumentException(NAME + " is required");
        }
        publicUrl = withoutTrailingSlash(publicUrl.trim());
        URI parsed = parse(publicUrl);
        if (parsed.getScheme() == null || !SCHEMES.contains(parsed.getScheme().toLowerCase(Locale.ROOT))) {
            throw new IllegalArgumentException(NAME + " must start with http:// or https://, but is '" + publicUrl + "'");
        }
        if (parsed.getHost() == null || parsed.getHost().isBlank()) {
            throw new IllegalArgumentException(NAME + " must name a host, but is '" + publicUrl + "'");
        }
    }

    public URI link(String path) {
        if (path == null || !path.startsWith("/")) {
            throw new IllegalArgumentException("A link path must start with '/', but is '" + path + "'");
        }
        return URI.create(publicUrl + path);
    }

    private static URI parse(String value) {
        try {
            return URI.create(value);
        } catch (IllegalArgumentException malformed) {
            throw new IllegalArgumentException(NAME + " is not a valid address: '" + value + "'", malformed);
        }
    }

    private static String withoutTrailingSlash(String value) {
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }
}
