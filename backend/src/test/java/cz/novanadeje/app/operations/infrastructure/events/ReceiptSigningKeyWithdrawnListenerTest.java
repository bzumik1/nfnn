package cz.novanadeje.app.operations.infrastructure.events;

import cz.novanadeje.app.operations.application.receiptseed.ReceiptSeedRenewalService;
import cz.novanadeje.app.shared.application.event.ReceiptSigningKeyWithdrawn;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.scheduling.annotation.Async;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.lang.reflect.Method;
import java.time.Instant;
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
    @DisplayName("Given the listeners of a committed withdrawal, when Spring runs its after-commit callbacks, then the renewal runs last and on the committing thread, after the notices were handed to the async executor")
    void should_run_last_on_the_committing_thread_when_committed_given_the_listeners_of_a_withdrawal() throws NoSuchMethodException {
        Method on = ReceiptSigningKeyWithdrawnListener.class.getDeclaredMethod("on", ReceiptSigningKeyWithdrawn.class);

        assertThat(on.getAnnotation(TransactionalEventListener.class).phase()).isEqualTo(TransactionPhase.AFTER_COMMIT);
        assertThat(on.getAnnotation(Order.class).value()).isEqualTo(Ordered.LOWEST_PRECEDENCE);
        assertThat(on.getAnnotation(Async.class)).isNull();
    }
}
