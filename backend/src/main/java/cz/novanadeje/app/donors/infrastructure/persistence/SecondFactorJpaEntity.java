package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.SecondFactor;
import cz.novanadeje.app.donors.domain.TotpSecret;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "donor_second_factor")
public class SecondFactorJpaEntity {

    @Id
    @Column(name = "donor_id")
    private UUID donorId;

    @Column(name = "secret", nullable = false, length = TotpSecret.LENGTH)
    private String secret;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "confirmed_at")
    private Instant confirmedAt;

    @Column(name = "last_used_step")
    private Long lastUsedStep;

    protected SecondFactorJpaEntity() {
    }

    static SecondFactorJpaEntity fromDomain(SecondFactor factor) {
        SecondFactorJpaEntity entity = new SecondFactorJpaEntity();
        entity.donorId = factor.donorId().value();
        entity.secret = factor.secret().value();
        entity.createdAt = factor.createdAt();
        entity.confirmedAt = factor.confirmedAt().orElse(null);
        entity.lastUsedStep = factor.lastUsedStep().isPresent() ? factor.lastUsedStep().getAsLong() : null;
        return entity;
    }

    SecondFactor toDomain() {
        return SecondFactor.reconstitute(new DonorId(donorId), new TotpSecret(secret), createdAt, confirmedAt, lastUsedStep);
    }
}
