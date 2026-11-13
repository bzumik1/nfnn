package cz.novanadeje.app.donors.application;

import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.SimpleTransactionStatus;

import java.util.ArrayList;
import java.util.List;

final class OpenTransactions implements PlatformTransactionManager {

    private int open;
    private int committed;
    private int rolledBack;
    private final List<Integer> openWhenHashing = new ArrayList<>();

    @Override
    public TransactionStatus getTransaction(TransactionDefinition definition) {
        open++;
        return new SimpleTransactionStatus();
    }

    @Override
    public void commit(TransactionStatus status) {
        open--;
        committed++;
    }

    @Override
    public void rollback(TransactionStatus status) {
        open--;
        rolledBack++;
    }

    int open() {
        return open;
    }

    int committed() {
        return committed;
    }

    int rolledBack() {
        return rolledBack;
    }

    <T> T recordingHashing(T result) {
        openWhenHashing.add(open);
        return result;
    }

    List<Integer> openWhenHashing() {
        return List.copyOf(openWhenHashing);
    }
}
