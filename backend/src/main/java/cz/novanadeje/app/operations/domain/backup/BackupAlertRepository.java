package cz.novanadeje.app.operations.domain.backup;

import java.time.Instant;
import java.util.List;

public interface BackupAlertRepository {

    void add(BackupAlert alert, Instant at);

    List<WaitingBackupAlert> waiting();

    void markSent(BackupAlertId id, Instant at);

    void dropWaitingProblems(Instant at);
}
