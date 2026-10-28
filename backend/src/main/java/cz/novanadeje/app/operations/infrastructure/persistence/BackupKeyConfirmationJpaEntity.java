package cz.novanadeje.app.operations.infrastructure.persistence;

import cz.novanadeje.app.operations.domain.backup.BackupKeyConfirmation;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Entity
@Table(name = "operations_backup_key_confirmation")
class BackupKeyConfirmationJpaEntity {

    static final short SINGLETON_ID = 1;

    @Id
    private Short id;

    @Column(name = "key_fingerprint", nullable = false, length = BackupKeyConfirmation.FINGERPRINT_LENGTH)
    private String keyFingerprint;

    @Column(name = "confirmed_at", nullable = false)
    private Instant confirmedAt;

    @Column(name = "confirmed_by")
    private UUID confirmedBy;

    protected BackupKeyConfirmationJpaEntity() {
    }

    static BackupKeyConfirmationJpaEntity fromDomain(BackupKeyConfirmation confirmation) {
        BackupKeyConfirmationJpaEntity entity = new BackupKeyConfirmationJpaEntity();
        entity.id = SINGLETON_ID;
        entity.keyFingerprint = confirmation.keyFingerprint();
        entity.confirmedAt = confirmation.confirmedAt();
        entity.confirmedBy = confirmation.confirmedBy().orElse(null);
        return entity;
    }

    BackupKeyConfirmation toDomain() {
        return new BackupKeyConfirmation(keyFingerprint, confirmedAt, Optional.ofNullable(confirmedBy));
    }
}
