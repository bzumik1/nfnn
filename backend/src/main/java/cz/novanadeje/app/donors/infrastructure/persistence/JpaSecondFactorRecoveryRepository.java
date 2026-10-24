package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.SecondFactorRecovery;
import cz.novanadeje.app.donors.domain.SecondFactorRecoveryRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Repository
class JpaSecondFactorRecoveryRepository implements SecondFactorRecoveryRepository {

    private final SecondFactorRecoveryJpaRepository jpa;

    JpaSecondFactorRecoveryRepository(SecondFactorRecoveryJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public void replaceOpenOf(DonorId donorId, SecondFactorRecovery recovery) {
        jpa.deleteOpenOf(donorId.value());
        jpa.save(SecondFactorRecoveryJpaEntity.fromDomain(recovery));
    }

    @Override
    public Optional<SecondFactorRecovery> findByCodeHash(String codeHash) {
        return jpa.findByCodeHash(codeHash).map(SecondFactorRecoveryJpaEntity::toDomain);
    }

    @Override
    public boolean markUsed(UUID recoveryId, Instant at) {
        return jpa.markUsed(recoveryId, at) == 1;
    }
}
