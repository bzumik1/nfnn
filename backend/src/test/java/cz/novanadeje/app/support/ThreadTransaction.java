package cz.novanadeje.app.support;

import org.springframework.transaction.support.TransactionSynchronizationManager;

public final class ThreadTransaction implements AutoCloseable {

    private ThreadTransaction() {
    }

    public static ThreadTransaction readWrite() {
        TransactionSynchronizationManager.initSynchronization();
        TransactionSynchronizationManager.setActualTransactionActive(true);
        return new ThreadTransaction();
    }

    public static ThreadTransaction readOnly() {
        ThreadTransaction transaction = readWrite();
        TransactionSynchronizationManager.setCurrentTransactionReadOnly(true);
        return transaction;
    }

    public static ThreadTransaction withoutSynchronization() {
        TransactionSynchronizationManager.setActualTransactionActive(true);
        return new ThreadTransaction();
    }

    @Override
    public void close() {
        TransactionSynchronizationManager.clear();
    }
}
