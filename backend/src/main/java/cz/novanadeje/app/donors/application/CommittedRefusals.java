package cz.novanadeje.app.donors.application;

import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.function.Supplier;

final class CommittedRefusals {

    private final TransactionTemplate transactions;
    private final List<Class<? extends RuntimeException>> committed;

    CommittedRefusals(PlatformTransactionManager transactions, List<Class<? extends RuntimeException>> committed) {
        this.transactions = new TransactionTemplate(transactions);
        this.committed = List.copyOf(committed);
    }

    <T> T execute(Supplier<T> work) {
        return transactions.execute(status -> attempt(work)).result();
    }

    void run(Runnable work) {
        execute(() -> {
            work.run();
            return Boolean.TRUE;
        });
    }

    private <T> Outcome<T> attempt(Supplier<T> work) {
        try {
            return new Outcome.Done<>(work.get());
        } catch (RuntimeException refusal) {
            if (committed.stream().anyMatch(kind -> kind.isInstance(refusal))) {
                return new Outcome.Refused<>(refusal);
            }
            throw refusal;
        }
    }

    private sealed interface Outcome<T> {

        T result();

        record Done<T>(T value) implements Outcome<T> {

            @Override
            public T result() {
                return value;
            }
        }

        record Refused<T>(RuntimeException refusal) implements Outcome<T> {

            @Override
            public T result() {
                throw refusal;
            }
        }
    }
}
