package cz.novanadeje.app.operations.infrastructure.events;

import cz.novanadeje.app.operations.application.receiptseed.ReceiptSeedRenewalService;
import cz.novanadeje.app.operations.application.restart.ApplicationRestarter;
import cz.novanadeje.app.shared.application.event.ReceiptSigningKeyWithdrawn;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.scheduling.annotation.Async;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.lang.reflect.Method;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class ReceiptSigningKeyWithdrawnListenerTest {

    private static final UUID ADMIN = UUID.fromString("019a1c00-0000-7000-8000-00000000a001");
    private static final Instant AT = Instant.parse("2026-11-20T09:30:00Z");

    private final ReceiptSeedRenewalService renewal = mock(ReceiptSeedRenewalService.class);
    private final ReceiptSigningKeyWithdrawnListener listener = new ReceiptSigningKeyWithdrawnListener(renewal);

    @Test
    @DisplayName("Given a committed withdrawal of the server's own key and of an earlier one, when each is heard, then the seed renewal gets the key id and whether the key was the server's own")
    void should_hand_the_key_id_and_whether_current_to_the_renewal_when_heard_given_committed_withdrawals() {
        listener.on(new ReceiptSigningKeyWithdrawn(ADMIN, "21fe31df", true, AT));
        listener.on(new ReceiptSigningKeyWithdrawn(ADMIN, "39f713d0", false, AT));

        verify(renewal).renewAfterWithdrawal("21fe31df", true);
        verify(renewal).renewAfterWithdrawal("39f713d0", false);
    }

    @Test
    @DisplayName("Given the renewal's listener, when its listener method is read, then it hears a withdrawal after the commit, ordered last and on the committing thread")
    void should_listen_after_commit_ordered_last_on_the_committing_thread_when_read_given_the_renewal_listener() throws NoSuchMethodException {
        Method on = ReceiptSigningKeyWithdrawnListener.class.getDeclaredMethod("on", ReceiptSigningKeyWithdrawn.class);

        assertThat(on.getAnnotation(TransactionalEventListener.class).phase()).isEqualTo(TransactionPhase.AFTER_COMMIT);
        assertThat(on.getAnnotation(Order.class).value()).isEqualTo(Ordered.LOWEST_PRECEDENCE);
        assertThat(on.getAnnotation(Async.class)).isNull();
    }

    @Test
    @DisplayName("Given the withdrawal of the server's own key published in a transaction, when it commits, then the restart once the async work is done is asked for after the commit with no transaction synchronization left, so the restarter starts its wait at once instead of waiting for a commit that already passed")
    void should_ask_for_the_restart_outside_any_synchronization_when_committed_given_the_current_key() {
        List<String> steps = new ArrayList<>();
        ApplicationRestarter restarter = new ApplicationRestarter() {
            @Override
            public void restartAfterCommitOnceAsyncWorkIsDone() {
                steps.add("restart once async work is done, synchronization active: " + TransactionSynchronizationManager.isSynchronizationActive());
            }

            @Override
            public void restartAfterCommitForRestore() {
                steps.add("restart for a restore");
            }
        };

        new ApplicationContextRunner()
                .withUserConfiguration(InMemoryTransactionManagement.class)
                .withBean(ReceiptSeedRenewalService.class, () -> new ReceiptSeedRenewalService(keyId -> steps.add("seed requested for " + keyId), restarter))
                .withBean(ReceiptSigningKeyWithdrawnListener.class)
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    new TransactionTemplate(context.getBean(PlatformTransactionManager.class)).executeWithoutResult(status -> {
                        context.publishEvent(new ReceiptSigningKeyWithdrawn(ADMIN, "21fe31df", true, AT));
                        steps.add("withdrawal still in its transaction");
                    });
                });

        assertThat(steps).containsExactly("withdrawal still in its transaction", "seed requested for 21fe31df", "restart once async work is done, synchronization active: false");
    }

    @Configuration(proxyBeanMethods = false)
    @EnableTransactionManagement
    static class InMemoryTransactionManagement {

        @Bean
        PlatformTransactionManager transactionManager() {
            return new InMemoryTransactions();
        }
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
