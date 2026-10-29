package cz.novanadeje.app.operations.infrastructure.settings;

import cz.novanadeje.app.operations.application.settings.CarriedSettingsKeyService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component
class CarriedSettingsKeyStartup {

    private static final Logger log = LoggerFactory.getLogger(CarriedSettingsKeyStartup.class);

    private final CarriedSettingsKeyService carried;

    CarriedSettingsKeyStartup(CarriedSettingsKeyService carried) {
        this.carried = carried;
    }

    @EventListener(ApplicationReadyEvent.class)
    void carryIntoBackups() {
        try {
            int sealedAgain = carried.carryIntoBackups();
            if (sealedAgain > 0) {
                log.info("{} stored secret settings restored from a backup are sealed again with this server's settings key", sealedAgain);
            }
        } catch (RuntimeException failure) {
            log.error("The settings key could not be carried into the backups ({})", failure.getClass().getSimpleName());
        }
    }
}
