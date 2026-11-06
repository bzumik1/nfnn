package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.application.pairing.PairingLock;
import cz.novanadeje.app.shared.infrastructure.lock.AdvisoryLock;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Component
@Transactional(propagation = Propagation.MANDATORY)
class PostgresPairingLock implements PairingLock {

    private final EntityManager entityManager;

    PostgresPairingLock(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    @Override
    public void acquire() {
        AdvisoryLock.PAIRING.acquireFor(entityManager);
    }
}
