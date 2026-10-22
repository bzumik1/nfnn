package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.application.pairing.PairingLock;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Component
@Transactional(propagation = Propagation.MANDATORY)
class PostgresPairingLock implements PairingLock {

    public static final long KEY = 20261022L;

    private final EntityManager entityManager;

    PostgresPairingLock(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    @Override
    public void acquire() {
        entityManager.createNativeQuery("select 1 from pg_advisory_xact_lock(:key)").setParameter("key", KEY).getSingleResult();
    }
}
