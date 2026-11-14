package cz.novanadeje.app.operations.infrastructure.github;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.net.URI;

@ConfigurationProperties("app.operations.releases")
public record ReleaseSourceProperties(URI source) {

    static final String HOST = "api.github.com";

    public ReleaseSourceProperties {
        if (source == null || !"https".equals(source.getScheme()) || !HOST.equals(source.getHost()) || source.getPort() != -1
                || source.getUserInfo() != null || source.getQuery() != null || source.getFragment() != null) {
            throw new IllegalArgumentException("app.operations.releases.source must be an https address on " + HOST + " without a port, user, query or fragment");
        }
    }
}
