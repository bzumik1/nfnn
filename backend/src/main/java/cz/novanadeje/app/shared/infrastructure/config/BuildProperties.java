package cz.novanadeje.app.shared.infrastructure.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("app.build")
public record BuildProperties(String revision) {

    public BuildProperties {
        if (revision == null || revision.isBlank()) {
            throw new IllegalArgumentException("APP_REVISION (app.build.revision) is required");
        }
        revision = revision.trim();
    }
}
