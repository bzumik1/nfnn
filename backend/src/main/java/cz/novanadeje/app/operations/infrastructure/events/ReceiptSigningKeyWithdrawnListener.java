package cz.novanadeje.app.operations.infrastructure.events;

import cz.novanadeje.app.operations.application.receiptseed.ReceiptSeedRenewalService;
import cz.novanadeje.app.shared.application.event.ReceiptSigningKeyWithdrawn;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
class ReceiptSigningKeyWithdrawnListener {

    private final ReceiptSeedRenewalService renewal;

    ReceiptSigningKeyWithdrawnListener(ReceiptSeedRenewalService renewal) {
        this.renewal = renewal;
    }

    @Order(Ordered.LOWEST_PRECEDENCE)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    void on(ReceiptSigningKeyWithdrawn withdrawn) {
        renewal.renewAfterWithdrawal(withdrawn.keyId(), withdrawn.current());
    }
}
