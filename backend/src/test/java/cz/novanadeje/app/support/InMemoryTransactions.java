package cz.novanadeje.app.support;

import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;

public final class InMemoryTransactions extends AbstractPlatformTransactionManager {

    public static TransactionTemplate template() {
        return new TransactionTemplate(new InMemoryTransactions());
    }

    @Override
    protected Object doGetTransaction() {
        return new Object();
    }

    @Override
    protected void doBegin(Object transaction, TransactionDefinition definition) {
    }

    @Override
    protected void doCommit(DefaultTransactionStatus status) {
    }

    @Override
    protected void doRollback(DefaultTransactionStatus status) {
    }
}
