package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.shared.application.restore.FinishedRestore;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "receipt_signing_key_adoption")
class ReceiptSigningKeyAdoptionJpaEntity {

    static final int MAX_RESTORE_ID_LENGTH = FinishedRestore.MAX_ID_LENGTH;

    @Id
    @Column(name = "restore_id", length = MAX_RESTORE_ID_LENGTH)
    private String restoreId;

    @Column(name = "adopted_at", nullable = false)
    private Instant adoptedAt;

    protected ReceiptSigningKeyAdoptionJpaEntity() {
    }
}
