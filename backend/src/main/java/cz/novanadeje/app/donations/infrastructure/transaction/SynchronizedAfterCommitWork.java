package cz.novanadeje.app.donations.infrastructure.transaction;

import cz.novanadeje.app.donations.application.receipt.AfterCommitWork;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Component
class SynchronizedAfterCommitWork implements AfterCommitWork {

    @Override
    public void run(Runnable work) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            work.run();
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                work.run();
            }
        });
    }
}
