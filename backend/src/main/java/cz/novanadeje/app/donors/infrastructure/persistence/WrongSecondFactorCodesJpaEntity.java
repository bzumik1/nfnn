package cz.novanadeje.app.donors.infrastructure.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "donor_second_factor_wrong_codes")
class WrongSecondFactorCodesJpaEntity {

    @Id
    @Column(name = "donor_id")
    private UUID donorId;

    @Column(name = "window_started_at", nullable = false)
    private Instant windowStartedAt;

    @Column(name = "wrong_codes", nullable = false)
    private int wrongCodes;

    @Column(name = "paused_until")
    private Instant pausedUntil;

    protected WrongSecondFactorCodesJpaEntity() {
    }
}
