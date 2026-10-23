package cz.novanadeje.app.operations.infrastructure.persistence;

import cz.novanadeje.app.operations.domain.backup.RestoreRecordRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;

@Repository
class JpaRestoreRecordRepository implements RestoreRecordRepository {

    private final RestoreRecordJpaRepository jpa;

    JpaRestoreRecordRepository(RestoreRecordJpaRepository jpa) {
        this.jpa = jpa;
    }

    @Override
    public boolean recordOnce(String requestId, Instant recordedAt) {
        if (requestId.length() > RestoreRecordJpaEntity.MAX_REQUEST_ID_LENGTH) {
            throw new IllegalArgumentException("A restore request id is at most " + RestoreRecordJpaEntity.MAX_REQUEST_ID_LENGTH + " characters");
        }
        return jpa.insertIfAbsent(requestId, recordedAt) == 1;
    }
}
