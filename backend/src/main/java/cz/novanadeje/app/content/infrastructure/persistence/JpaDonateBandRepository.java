package cz.novanadeje.app.content.infrastructure.persistence;

import cz.novanadeje.app.content.domain.donateband.DonateBand;
import cz.novanadeje.app.content.domain.donateband.DonateBandRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
class JpaDonateBandRepository implements DonateBandRepository {

    private final DonateBandJpaRepository jpa;

    JpaDonateBandRepository(DonateBandJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public Optional<DonateBand> find() {
        return jpa.findById(DonateBandJpaEntity.SINGLETON_ID).map(DonateBandJpaEntity::toDomain);
    }

    @Override
    public void save(DonateBand band) {
        jpa.save(DonateBandJpaEntity.fromDomain(band));
    }
}
