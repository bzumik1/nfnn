package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.shared.domain.EmailAddress;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
public class AdministratorBootstrap {

    private static final Logger log = LoggerFactory.getLogger(AdministratorBootstrap.class);

    private final AdministratorProperties properties;
    private final AdministratorService administrators;

    public AdministratorBootstrap(AdministratorProperties properties, AdministratorService administrators) {
        this.properties = properties;
        this.administrators = administrators;
    }

    public void run() {
        int position = 0;
        for (EmailAddress email : properties.addresses()) {
            position++;
            switch (administrators.grantAtStartup(email)) {
                case GRANTED -> log.info("Configured administrator {} of {} received the role", position, properties.addresses().size());
                case ALREADY_ADMINISTRATOR -> log.debug("Configured administrator {} of {} already holds the role", position,
                        properties.addresses().size());
                case SITE_HAS_ADMINISTRATOR -> log.debug("Configured administrator {} of {} gets no role because the site already has "
                        + "an administrator", position, properties.addresses().size());
                case NOT_REGISTERED -> log.info("Configured administrator {} of {} is not registered yet; the role follows once the "
                        + "address is confirmed", position, properties.addresses().size());
                case NOT_CONFIRMED -> log.info("Configured administrator {} of {} has not confirmed the address yet; the role follows once "
                        + "it is confirmed", position, properties.addresses().size());
            }
        }
    }

    public void grantOnConfirmation(UUID donorId, EmailAddress email) {
        if (properties.addresses().contains(email) && administrators.grantAtStartup(email) == StartupGrant.GRANTED) {
            log.info("Configured administrator {} received the role on confirming the address", donorId);
        }
    }
}
