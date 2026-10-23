package cz.novanadeje.app.operations.domain.backup;

import java.time.Instant;

public interface RestoreRecordRepository {

    boolean recordOnce(String requestId, Instant recordedAt);
}
