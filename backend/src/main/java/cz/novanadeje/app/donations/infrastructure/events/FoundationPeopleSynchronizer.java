package cz.novanadeje.app.donations.infrastructure.events;

import cz.novanadeje.app.donations.application.receipt.ReceiptSignatureService;
import cz.novanadeje.app.donations.domain.receipt.PersonReference;
import cz.novanadeje.app.shared.application.event.FoundationPersonRemoved;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
class FoundationPeopleSynchronizer {

    private final ReceiptSignatureService signatures;

    FoundationPeopleSynchronizer(ReceiptSignatureService signatures) {
        this.signatures = signatures;
    }

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT, fallbackExecution = true)
    void onRemoved(FoundationPersonRemoved event) {
        signatures.forget(new PersonReference(event.personId()));
    }
}
