package cz.novanadeje.app.shared.infrastructure.transaction;

import cz.novanadeje.app.shared.application.transaction.AfterCommitWork;
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
