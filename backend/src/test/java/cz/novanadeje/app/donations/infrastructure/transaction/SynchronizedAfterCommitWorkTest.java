package cz.novanadeje.app.donations.infrastructure.transaction;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SynchronizedAfterCommitWorkTest {

    private final SynchronizedAfterCommitWork afterCommit = new SynchronizedAfterCommitWork();
    private final TransactionTemplate transactions = new TransactionTemplate(new InMemoryTransactions());
    private final List<String> done = new ArrayList<>();

    @Test
    @DisplayName("Given no transaction, when work is handed over, then it runs at once")
    void should_run_at_once_when_handed_over_given_no_transaction() {
        afterCommit.run(() -> done.add("logged"));

        assertThat(done).containsExactly("logged");
    }

    @Test
    @DisplayName("Given a transaction, when work is handed over, then it runs only once the transaction has committed")
    void should_run_after_commit_when_handed_over_given_transaction() {
        transactions.executeWithoutResult(status -> {
            afterCommit.run(() -> done.add("logged"));
            done.add("still in the transaction");
        });

        assertThat(done).containsExactly("still in the transaction", "logged");
    }

    @Test
    @DisplayName("Given a transaction that rolls back, when work is handed over, then it never runs")
    void should_not_run_when_handed_over_given_transaction_rolls_back() {
        transactions.executeWithoutResult(status -> {
            afterCommit.run(() -> done.add("logged"));
            status.setRollbackOnly();
        });

        assertThat(done).isEmpty();
    }

    @Test
    @DisplayName("Given a transaction that fails, when work is handed over, then it never runs")
    void should_not_run_when_handed_over_given_transaction_fails() {
        assertThatThrownBy(() -> transactions.executeWithoutResult(status -> {
            afterCommit.run(() -> done.add("logged"));
            throw new IllegalStateException("refused");
        })).isInstanceOf(IllegalStateException.class);

        assertThat(done).isEmpty();
    }

    private static final class InMemoryTransactions extends AbstractPlatformTransactionManager {

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
}
