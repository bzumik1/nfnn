package cz.novanadeje.app.shared.infrastructure.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.actuate.info.Info;
import org.springframework.boot.actuate.info.InfoContributor;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class BuildRevision implements InfoContributor {

    private static final Logger log = LoggerFactory.getLogger(BuildRevision.class);

    private final BuildProperties properties;

    public BuildRevision(BuildProperties properties) {
        this.properties = properties;
    }

    @Override
    public void contribute(Info.Builder builder) {
        builder.withDetail("build", Map.of("revision", properties.revision()));
    }

    @EventListener(ApplicationReadyEvent.class)
    public void logRevision() {
        log.info("Backend revision {} is ready", properties.revision());
    }
}
