package cz.novanadeje.app.donations.infrastructure.events;

import cz.novanadeje.app.donations.application.donor.ChangeDonorRecordProfileCommand;
import cz.novanadeje.app.donations.application.donor.DonorRecordService;
import cz.novanadeje.app.donations.application.donor.RegisterDonorRecordCommand;
import cz.novanadeje.app.shared.application.event.DonorErased;
import cz.novanadeje.app.shared.application.event.DonorProfileChanged;
import cz.novanadeje.app.shared.application.event.DonorRegistered;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
class DonorRecordSynchronizer {

    private static final Logger log = LoggerFactory.getLogger(DonorRecordSynchronizer.class);

    private final DonorRecordService donorRecordService;

    DonorRecordSynchronizer(DonorRecordService donorRecordService) {
        this.donorRecordService = donorRecordService;
    }

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT, fallbackExecution = true)
    void onRegistered(DonorRegistered event) {
        donorRecordService.register(new RegisterDonorRecordCommand(event.donorId(), event.type(), event.name(), event.companyIdentifier(),
                event.address(), event.variableSymbol(), event.preferredLocale(), event.registeredAt()));
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    void pairAfterRegistration(DonorRegistered event) {
        try {
            donorRecordService.pairPaymentsOf(event.donorId());
        } catch (RuntimeException e) {
            log.warn("Pairing the payments of donor {} after the registration failed; the hourly import pairs them", event.donorId(), e);
        }
    }

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT, fallbackExecution = true)
    void onErased(DonorErased event) {
        donorRecordService.erase(event.donorId(), event.erasedAt());
    }

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT, fallbackExecution = true)
    void onProfileChanged(DonorProfileChanged event) {
        donorRecordService.changeProfile(new ChangeDonorRecordProfileCommand(event.donorId(), event.name(), event.address(),
                event.preferredLocale()));
    }
}
