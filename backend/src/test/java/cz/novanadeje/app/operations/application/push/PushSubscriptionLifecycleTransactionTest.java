package cz.novanadeje.app.operations.application.push;

import cz.novanadeje.app.IntegrationTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.IllegalTransactionStateException;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

@IntegrationTest
class PushSubscriptionLifecycleTransactionTest {

    private static final UUID JANA = UUID.fromString("01a18e56-bdb0-775a-bd0a-a60756831369");
    private static final UUID PHONE = UUID.fromString("01a18e56-bdb0-775a-bd0a-a6075683136a");

    @Autowired
    private PushSubscriptionLifecycle lifecycle;

    @Test
    @DisplayName("Given no running transaction, when any deletion of the push devices is called, then it is refused, because the devices go only with the change that announced it")
    void should_refuse_every_deletion_when_called_given_no_running_transaction() {
        assertThatThrownBy(() -> lifecycle.deleteAllOfFormerAdministrator(JANA)).isInstanceOf(IllegalTransactionStateException.class);
        assertThatThrownBy(() -> lifecycle.deleteAllOfErasedDonor(JANA)).isInstanceOf(IllegalTransactionStateException.class);
        assertThatThrownBy(() -> lifecycle.deleteAllOfSignedOutDevice(PHONE)).isInstanceOf(IllegalTransactionStateException.class);
    }
}
