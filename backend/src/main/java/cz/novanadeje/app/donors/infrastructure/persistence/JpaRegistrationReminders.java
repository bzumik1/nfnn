package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.RegistrationReminders;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
class JpaRegistrationReminders implements RegistrationReminders {

    private static final int MAX_PER_RUN = 100;

    private final RegistrationReminderJpaRepository jpa;

    JpaRegistrationReminders(RegistrationReminderJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public List<DonorId> dueFor(Instant registeredAfter, Instant registeredUntil) {
        return jpa.findDue(registeredAfter, registeredUntil, MAX_PER_RUN).stream().map(DonorId::new).toList();
    }

    @Override
    public void recordSent(DonorId donorId, Instant at) {
        jpa.insertIgnoringRecorded(donorId.value(), at);
    }
}
