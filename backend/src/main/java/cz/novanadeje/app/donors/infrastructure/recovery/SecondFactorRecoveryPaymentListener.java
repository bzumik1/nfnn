package cz.novanadeje.app.donors.infrastructure.recovery;

import cz.novanadeje.app.donors.application.SecondFactorRecoveryService;
import cz.novanadeje.app.shared.application.event.SecondFactorRecoveryPaid;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component
class SecondFactorRecoveryPaymentListener {

    private final SecondFactorRecoveryService recoveries;

    SecondFactorRecoveryPaymentListener(SecondFactorRecoveryService recoveries) {
        this.recoveries = recoveries;
    }

    @EventListener
    void onPaid(SecondFactorRecoveryPaid payment) {
        recoveries.complete(payment);
    }
}
