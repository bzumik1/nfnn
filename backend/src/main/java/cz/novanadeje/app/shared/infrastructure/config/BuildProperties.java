package cz.novanadeje.app.shared.infrastructure.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.regex.Pattern;

@ConfigurationProperties("app.build")
public record BuildProperties(String revision, String version) {

    private static final Pattern RELEASE = Pattern.compile("\\d{4}\\.(?:1[0-2]|[1-9])\\.[1-9]\\d{0,3}|dev");

    public BuildProperties {
        if (revision == null || revision.isBlank()) {
            throw new IllegalArgumentException("APP_REVISION (app.build.revision) is required");
        }
        revision = revision.trim();
        version = version == null ? "" : version.trim();
        if (!RELEASE.matcher(version).matches()) {
            throw new IllegalArgumentException("APP_VERSION (app.build.version) must be a release such as 2026.11.3, or dev");
        }
    }
}
