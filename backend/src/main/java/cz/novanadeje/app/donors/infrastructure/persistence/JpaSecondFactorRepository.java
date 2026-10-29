package cz.novanadeje.app.donors.infrastructure.persistence;

import cz.novanadeje.app.donors.domain.DonorId;
import cz.novanadeje.app.donors.domain.SecondFactor;
import cz.novanadeje.app.donors.domain.SecondFactorRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
class JpaSecondFactorRepository implements SecondFactorRepository {

    private final SecondFactorJpaRepository jpa;

    JpaSecondFactorRepository(SecondFactorJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public void save(SecondFactor factor) {
        jpa.save(SecondFactorJpaEntity.fromDomain(factor));
    }

    @Override
    public boolean recordUse(SecondFactor factor) {
        long step = factor.lastUsedStep().orElseThrow(() -> new IllegalArgumentException("A use is recorded for a factor whose code was used"));
        return jpa.recordUse(factor.donorId().value(), step) == 1;
    }

    @Override
    public Optional<SecondFactor> findByDonor(DonorId donorId) {
        return jpa.findById(donorId.value()).map(SecondFactorJpaEntity::toDomain);
    }

    @Override
    public void delete(DonorId donorId) {
        jpa.deleteById(donorId.value());
        jpa.flush();
    }
}
