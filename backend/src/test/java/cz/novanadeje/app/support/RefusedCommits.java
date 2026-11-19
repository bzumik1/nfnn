package cz.novanadeje.app.support;

import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

public final class RefusedCommits {

    private RefusedCommits() {
    }

    public static void refuseTheCommitAfterEverythingRegisteredSoFar() {
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void beforeCommit(boolean readOnly) {
                throw new IllegalStateException("The commit was refused after the audit insert");
            }
        });
    }
}
