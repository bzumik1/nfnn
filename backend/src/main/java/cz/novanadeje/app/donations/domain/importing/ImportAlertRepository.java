package cz.novanadeje.app.donations.domain.importing;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface ImportAlertRepository {

    void add(ImportAlert alert, Instant at);

    List<WaitingImportAlert> waiting();

    void markSent(UUID id, Instant at);

    void dropWaitingOutages(Instant at);
}
