package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.importing.BankImportState;
import cz.novanadeje.app.donations.domain.importing.BankImportStateRepository;
import org.springframework.stereotype.Repository;

import java.time.Clock;

@Repository
class JpaBankImportStateRepository implements BankImportStateRepository {

    private final BankImportStateJpaRepository jpa;
    private final Clock clock;

    JpaBankImportStateRepository(BankImportStateJpaRepository jpa, Clock clock) {
        this.jpa = jpa;
        this.clock = clock;
    }

    @Override
    public BankImportState current() {
        return jpa.findById(BankImportStateJpaEntity.SINGLETON_ID)
                .map(BankImportStateJpaEntity::toDomain)
                .orElseGet(() -> BankImportState.initial(clock.instant()));
    }

    @Override
    public void save(BankImportState state) {
        jpa.save(BankImportStateJpaEntity.fromDomain(state));
    }
}
