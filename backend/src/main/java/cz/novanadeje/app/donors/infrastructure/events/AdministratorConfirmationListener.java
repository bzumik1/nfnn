package cz.novanadeje.app.donors.infrastructure.events;

import cz.novanadeje.app.donors.application.AdministratorBootstrap;
import cz.novanadeje.app.shared.application.event.DonorRegistered;
import cz.novanadeje.app.shared.infrastructure.transaction.PublishingTransaction;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
class AdministratorConfirmationListener {

    private final AdministratorBootstrap bootstrap;

    AdministratorConfirmationListener(AdministratorBootstrap bootstrap) {
        this.bootstrap = bootstrap;
    }

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT, fallbackExecution = true)
    void onRegistered(DonorRegistered registered) {
        PublishingTransaction.require(registered);
        bootstrap.grantOnConfirmation(registered.donorId(), registered.email());
    }
}
