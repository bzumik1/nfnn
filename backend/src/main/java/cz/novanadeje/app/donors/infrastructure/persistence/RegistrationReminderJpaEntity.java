package cz.novanadeje.app.donors.infrastructure.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "donor_registration_reminder")
public class RegistrationReminderJpaEntity {

    @Id
    @Column(name = "donor_id")
    private UUID donorId;

    @Column(name = "sent_at", nullable = false)
    private Instant sentAt;

    protected RegistrationReminderJpaEntity() {
    }
}
