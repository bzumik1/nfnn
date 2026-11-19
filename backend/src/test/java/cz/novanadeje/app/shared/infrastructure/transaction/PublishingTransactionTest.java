package cz.novanadeje.app.shared.infrastructure.transaction;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PublishingTransactionTest {

    private record PlantedEvent(String detail) {
    }

    @AfterEach
    void leaveNoTransaction() {
        TransactionSynchronizationManager.setActualTransactionActive(false);
        TransactionSynchronizationManager.setCurrentTransactionReadOnly(false);
    }

    @Test
    @DisplayName("Given no transaction on the thread, when a before-commit listener requires the publisher's transaction, then it fails naming only the event's kind")
    void should_fail_naming_the_event_kind_when_required_given_no_transaction() {
        assertThatThrownBy(() -> PublishingTransaction.require(new PlantedEvent("Jana Nováková")))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("PlantedEvent")
                .hasMessageNotContaining("Jana");
    }

    @Test
    @DisplayName("Given a read-only transaction on the thread, when a before-commit listener requires the publisher's transaction, then it fails")
    void should_fail_when_required_given_a_read_only_transaction() {
        TransactionSynchronizationManager.setActualTransactionActive(true);
        TransactionSynchronizationManager.setCurrentTransactionReadOnly(true);

        assertThatThrownBy(() -> PublishingTransaction.require(new PlantedEvent("detail")))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("PlantedEvent");
    }

    @Test
    @DisplayName("Given a read-write transaction on the thread, when a before-commit listener requires the publisher's transaction, then it goes on")
    void should_go_on_when_required_given_a_read_write_transaction() {
        TransactionSynchronizationManager.setActualTransactionActive(true);

        assertThatCode(() -> PublishingTransaction.require(new PlantedEvent("detail"))).doesNotThrowAnyException();
    }
}
