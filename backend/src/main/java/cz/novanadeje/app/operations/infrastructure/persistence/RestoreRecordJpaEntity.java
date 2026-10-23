package cz.novanadeje.app.operations.infrastructure.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "operations_restore_record")
class RestoreRecordJpaEntity {

    static final int MAX_REQUEST_ID_LENGTH = 36;

    @Id
    @Column(name = "request_id", length = MAX_REQUEST_ID_LENGTH)
    private String requestId;

    @Column(name = "recorded_at", nullable = false)
    private Instant recordedAt;

    protected RestoreRecordJpaEntity() {
    }
}
