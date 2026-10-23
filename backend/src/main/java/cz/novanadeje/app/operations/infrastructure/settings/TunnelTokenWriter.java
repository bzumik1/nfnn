package cz.novanadeje.app.operations.infrastructure.settings;

import cz.novanadeje.app.operations.domain.settings.Setting;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.PosixFilePermissions;

@Component
class TunnelTokenWriter {

    static final String TOKEN_FILE = "token";

    private static final Logger log = LoggerFactory.getLogger(TunnelTokenWriter.class);

    private final SettingsProperties properties;
    private final Environment environment;

    TunnelTokenWriter(SettingsProperties properties, Environment environment) {
        this.properties = properties;
        this.environment = environment;
    }

    @EventListener(ApplicationReadyEvent.class)
    void write() {
        Path directory = properties.tunnelDirectory();
        if (!Files.isDirectory(directory)) {
            log.debug("No tunnel folder at {}; the tunnel token is not written", directory);
            return;
        }
        Path token = directory.resolve(TOKEN_FILE);
        String value = environment.getProperty(SettingProperties.runningProperty(Setting.TUNNEL_TOKEN), "").strip();
        try {
            if (value.isEmpty()) {
                if (Files.deleteIfExists(token)) {
                    log.info("Tunnel token removed; the tunnel stops");
                }
                return;
            }
            Path part = directory.resolve(TOKEN_FILE + ".part");
            Files.writeString(part, value, StandardCharsets.UTF_8);
            Files.setPosixFilePermissions(part, PosixFilePermissions.fromString("rw-r--r--"));
            Files.move(part, token, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            log.info("Tunnel token written for cloudflared");
        } catch (IOException | UnsupportedOperationException failure) {
            log.warn("The tunnel token could not be written to {}: {}", directory, failure.getClass().getSimpleName());
        }
    }
}
