package cz.novanadeje.app.operations.infrastructure.logs;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.nio.file.Path;
import java.util.Objects;

@ConfigurationProperties("app.operations.logs")
public record LogProperties(Path directory) {

    public LogProperties {
        Objects.requireNonNull(directory, "app.operations.logs.directory is required");
    }
}
