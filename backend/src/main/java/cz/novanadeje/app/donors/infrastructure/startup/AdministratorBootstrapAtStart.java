package cz.novanadeje.app.donors.infrastructure.startup;

import cz.novanadeje.app.donors.application.AdministratorBootstrap;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component
class AdministratorBootstrapAtStart {

    private final AdministratorBootstrap bootstrap;

    AdministratorBootstrapAtStart(AdministratorBootstrap bootstrap) {
        this.bootstrap = bootstrap;
    }

    @EventListener(ApplicationReadyEvent.class)
    void grantConfiguredAdministrators() {
        bootstrap.run();
    }
}
