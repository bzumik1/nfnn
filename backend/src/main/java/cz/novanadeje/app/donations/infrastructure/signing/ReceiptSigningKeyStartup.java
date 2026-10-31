package cz.novanadeje.app.donations.infrastructure.signing;

import cz.novanadeje.app.donations.application.signing.ReceiptSigningKeyRegistration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

@Component
class ReceiptSigningKeyStartup {

    private static final Logger log = LoggerFactory.getLogger(ReceiptSigningKeyStartup.class);

    private final ReceiptSigningKeyRegistration registration;

    ReceiptSigningKeyStartup(ReceiptSigningKeyRegistration registration) {
        this.registration = registration;
    }

    @EventListener(ApplicationReadyEvent.class)
    @Order(Ordered.HIGHEST_PRECEDENCE)
    void registerOwnKey() {
        try {
            registration.registerOwnKey();
        } catch (RuntimeException failure) {
            log.error("The receipt signing key could not be registered ({})", failure.getClass().getSimpleName());
        }
    }
}
