package cz.novanadeje.app.donors.infrastructure.events;

import cz.novanadeje.app.donors.application.AdministratorBootstrap;
import cz.novanadeje.app.shared.application.event.DonorRegistered;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
class AdministratorConfirmationListener {

    private final AdministratorBootstrap bootstrap;

    AdministratorConfirmationListener(AdministratorBootstrap bootstrap) {
        this.bootstrap = bootstrap;
    }

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    void onRegistered(DonorRegistered registered) {
        bootstrap.grantOnConfirmation(registered.donorId(), registered.email());
    }
}
