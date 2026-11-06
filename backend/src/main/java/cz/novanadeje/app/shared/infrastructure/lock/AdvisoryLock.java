package cz.novanadeje.app.shared.infrastructure.lock;

import jakarta.persistence.EntityManager;

public enum AdvisoryLock {

    PAIRING(20261022L),
    PUSH_SUBSCRIPTION_WRITES(20261105L),
    REPORT_SETTINGS_CHANGES(20261106L),
    OPERATIONAL_ALERT_CHANGES(20261107L),
    DONOR_EMAIL_ADDRESSES(20261108L),
    DONOR_SESSIONS(20261109L),
    SCHEMA_MIGRATION(20261110L);

    private final long key;

    AdvisoryLock(long key) {
        this.key = key;
    }

    public long key() {
        return key;
    }

    public String sessionLockAttempt() {
        return "select pg_try_advisory_lock(" + key + ")";
    }

    public String sessionLockRelease() {
        return "select pg_advisory_unlock(" + key + ")";
    }

    public void acquireFor(EntityManager entityManager) {
        entityManager.createNativeQuery("select 1 from pg_advisory_xact_lock(:key)").setParameter("key", key).getSingleResult();
    }

    public void acquireFor(EntityManager entityManager, String subject) {
        entityManager.createNativeQuery("select 1 from pg_advisory_xact_lock(:key, :subject)")
                .setParameter("key", Math.toIntExact(key))
                .setParameter("subject", subject.hashCode())
                .getSingleResult();
    }
}
