package cz.novanadeje.app.shared.infrastructure.transaction;

import cz.novanadeje.app.support.ThreadTransaction;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PublishingTransactionTest {

    private record PlantedEvent(String detail) {
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
        try (ThreadTransaction ignored = ThreadTransaction.readOnly()) {
            assertThatThrownBy(() -> PublishingTransaction.require(new PlantedEvent("detail")))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("PlantedEvent");
        }
    }

    @Test
    @DisplayName("Given a transaction whose synchronizations are gone, as while an after-commit listener runs, when a before-commit listener requires the publisher's transaction, then it fails")
    void should_fail_when_required_given_a_transaction_without_synchronization() {
        try (ThreadTransaction ignored = ThreadTransaction.withoutSynchronization()) {
            assertThatThrownBy(() -> PublishingTransaction.require(new PlantedEvent("detail")))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("PlantedEvent");
        }
    }

    @Test
    @DisplayName("Given a read-write transaction on the thread, when a before-commit listener requires the publisher's transaction, then it goes on")
    void should_go_on_when_required_given_a_read_write_transaction() {
        try (ThreadTransaction ignored = ThreadTransaction.readWrite()) {
            assertThatCode(() -> PublishingTransaction.require(new PlantedEvent("detail"))).doesNotThrowAnyException();
        }
    }
}
