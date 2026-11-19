package cz.novanadeje.app.shared.infrastructure.transaction;

import org.springframework.transaction.support.TransactionSynchronizationManager;

public final class PublishingTransaction {

    private PublishingTransaction() {
    }

    public static void require(Object event) {
        if (!TransactionSynchronizationManager.isActualTransactionActive() || TransactionSynchronizationManager.isCurrentTransactionReadOnly()) {
            throw new IllegalStateException(event.getClass().getSimpleName()
                    + " was published outside a read-write transaction, so the before-commit listener that must join it cannot");
        }
    }
}
