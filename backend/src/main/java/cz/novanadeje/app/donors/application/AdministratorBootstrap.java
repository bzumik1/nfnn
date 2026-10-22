package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.shared.domain.EmailAddress;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component
public class AdministratorBootstrap {

    private static final Logger log = LoggerFactory.getLogger(AdministratorBootstrap.class);

    private final AdministratorProperties properties;
    private final AdministratorService administrators;

    public AdministratorBootstrap(AdministratorProperties properties, AdministratorService administrators) {
        this.properties = properties;
        this.administrators = administrators;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void run() {
        int position = 0;
        for (EmailAddress email : properties.addresses()) {
            position++;
            switch (administrators.grantAtStartup(email)) {
                case GRANTED -> log.info("Configured administrator {} of {} received the role", position, properties.addresses().size());
                case ALREADY_ADMINISTRATOR -> log.debug("Configured administrator {} of {} already holds the role", position,
                        properties.addresses().size());
                case NOT_REGISTERED -> log.warn("Configured administrator {} of {} is not registered yet; the role waits for the next start "
                        + "after the registration", position, properties.addresses().size());
            }
        }
    }
}
