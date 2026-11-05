package cz.novanadeje.app.shared.infrastructure.live;

import cz.novanadeje.app.shared.application.event.DeviceSignedOut;
import cz.novanadeje.app.shared.application.event.DonorSessionsEnded;
import cz.novanadeje.app.shared.application.event.StoredDataChanged;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
class LiveHintListener {

    private final LiveStreamHub hub;

    LiveHintListener(LiveStreamHub hub) {
        this.hub = hub;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    void onStoredDataChanged(StoredDataChanged change) {
        hub.publish(change);
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    void onSessionsEnded(DonorSessionsEnded ended) {
        hub.endSessions(ended);
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    void onDeviceSignedOut(DeviceSignedOut signedOut) {
        hub.endDevice(signedOut);
    }
}
