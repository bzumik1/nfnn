package cz.novanadeje.app.operations.infrastructure.persistence;

import cz.novanadeje.app.operations.domain.backup.BackupKeyConfirmation;
import cz.novanadeje.app.operations.domain.backup.BackupKeyConfirmationRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
class JpaBackupKeyConfirmationRepository implements BackupKeyConfirmationRepository {

    private final BackupKeyConfirmationJpaRepository jpa;

    JpaBackupKeyConfirmationRepository(BackupKeyConfirmationJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public Optional<BackupKeyConfirmation> find() {
        return jpa.findById(BackupKeyConfirmationJpaEntity.SINGLETON_ID).map(BackupKeyConfirmationJpaEntity::toDomain);
    }

    @Override
    public void save(BackupKeyConfirmation confirmation) {
        jpa.save(BackupKeyConfirmationJpaEntity.fromDomain(confirmation));
    }
}
