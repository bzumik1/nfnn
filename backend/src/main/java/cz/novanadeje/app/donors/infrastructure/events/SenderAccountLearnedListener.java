package cz.novanadeje.app.donors.infrastructure.events;

import cz.novanadeje.app.donors.application.SenderAccountLearnedNotices;
import cz.novanadeje.app.shared.application.event.SenderAccountLearned;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
class SenderAccountLearnedListener {

    private final SenderAccountLearnedNotices notices;

    SenderAccountLearnedListener(SenderAccountLearnedNotices notices) {
        this.notices = notices;
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void on(SenderAccountLearned learned) {
        notices.tell(learned.donorId(), learned.accountLastDigits());
    }
}
