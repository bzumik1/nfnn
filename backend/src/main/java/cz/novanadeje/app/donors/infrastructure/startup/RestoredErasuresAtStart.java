package cz.novanadeje.app.donors.infrastructure.startup;

import cz.novanadeje.app.donors.application.RestoredErasures;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component
class RestoredErasuresAtStart {

    private final RestoredErasures erasures;

    RestoredErasuresAtStart(RestoredErasures erasures) {
        this.erasures = erasures;
    }

    @EventListener(ApplicationReadyEvent.class)
    void completeErasuresARestoreBroughtBack() {
        erasures.completeErasuresARestoreBroughtBack();
    }
}
