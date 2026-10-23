package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.importing.ImportAlert;
import cz.novanadeje.app.donations.domain.importing.ImportAlertRepository;
import cz.novanadeje.app.donations.domain.importing.WaitingImportAlert;
import cz.novanadeje.app.shared.domain.UuidV7;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Repository
class JpaImportAlertRepository implements ImportAlertRepository {

    private final ImportAlertJpaRepository jpa;

    JpaImportAlertRepository(ImportAlertJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public void add(ImportAlert alert, Instant at) {
        jpa.save(ImportAlertJpaEntity.waiting(UuidV7.generate(at), alert, at));
    }

    @Override
    public List<WaitingImportAlert> waiting() {
        return jpa.findWaiting().stream().map(ImportAlertJpaEntity::toWaiting).toList();
    }

    @Override
    public void markSent(UUID id, Instant at) {
        jpa.markSent(id, at);
    }

    @Override
    public void dropWaitingOutages(Instant at) {
        jpa.dropWaiting(ImportAlertJpaEntity.Kind.OUTAGE, at);
    }
}
