package cz.novanadeje.app.operations.infrastructure.startup;

import cz.novanadeje.app.operations.application.settings.SetupService;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component
class SetupCodeAtStart {

    private final SetupService setup;

    SetupCodeAtStart(SetupService setup) {
        this.setup = setup;
    }

    @EventListener(ApplicationReadyEvent.class)
    void announceCodeWhileRequired() {
        setup.announceCodeWhileRequired();
    }
}
