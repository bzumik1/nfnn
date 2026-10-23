package cz.novanadeje.app.donors.domain;

import java.time.Instant;
import java.util.List;

public interface RegistrationReminders {

    List<DonorId> dueFor(Instant registeredAfter, Instant registeredUntil);

    void recordSent(DonorId donorId, Instant at);
}
