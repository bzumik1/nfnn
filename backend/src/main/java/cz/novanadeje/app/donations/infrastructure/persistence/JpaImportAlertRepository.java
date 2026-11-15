package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.importing.ImportAlert;
import cz.novanadeje.app.donations.domain.importing.ImportAlertId;
import cz.novanadeje.app.donations.domain.importing.ImportAlertRepository;
import cz.novanadeje.app.donations.domain.importing.WaitingImportAlert;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
class JpaImportAlertRepository implements ImportAlertRepository {

    private final ImportAlertJpaRepository jpa;

    JpaImportAlertRepository(ImportAlertJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public void add(ImportAlert alert, Instant at) {
        jpa.save(ImportAlertJpaEntity.waiting(ImportAlertId.newId(at), alert, at));
    }

    @Override
    public List<WaitingImportAlert> waiting() {
        return jpa.findWaiting().stream().map(ImportAlertJpaEntity::toWaiting).toList();
    }

    @Override
    public void markSent(ImportAlertId id, Instant at) {
        jpa.markSent(id.value(), at);
    }

    @Override
    public void dropWaitingOutages(Instant at) {
        jpa.dropWaiting(ImportAlertJpaEntity.Kind.OUTAGE, at);
    }
}
