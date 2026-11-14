package cz.novanadeje.app.operations.infrastructure.events;

import cz.novanadeje.app.operations.application.push.DonorPushDispatcher;
import cz.novanadeje.app.shared.application.event.DonationsArrived;
import cz.novanadeje.app.shared.application.event.YearlyReceiptsReady;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
class DonorPushListener {

    private final DonorPushDispatcher dispatcher;

    DonorPushListener(DonorPushDispatcher dispatcher) {
        this.dispatcher = dispatcher;
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void on(DonationsArrived arrived) {
        dispatcher.giftsArrived(arrived.donorIds());
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void on(YearlyReceiptsReady ready) {
        dispatcher.yearlyReceiptsReady(ready.donorIds());
    }
}
