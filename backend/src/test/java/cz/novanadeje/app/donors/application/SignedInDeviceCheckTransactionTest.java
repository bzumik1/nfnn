package cz.novanadeje.app.donors.application;

import cz.novanadeje.app.IntegrationTest;
import cz.novanadeje.app.donors.domain.DeviceId;
import cz.novanadeje.app.donors.domain.DonorId;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.IllegalTransactionStateException;

import java.time.Clock;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

@IntegrationTest
class SignedInDeviceCheckTransactionTest {

    @Autowired
    private SignedInDeviceCheck check;
    @Autowired
    private Clock clock;

    @Test
    @DisplayName("Given no transaction, when another context holds a device, then it is refused, so the donor's sessions lock is never released before that context's write commits")
    void should_refuse_when_held_given_no_transaction() {
        DonorId jana = DonorId.newId(clock.instant());
        DeviceId phone = DeviceId.newId(clock.instant());

        assertThatThrownBy(() -> check.hold(jana, phone)).isInstanceOf(IllegalTransactionStateException.class);
    }
}
