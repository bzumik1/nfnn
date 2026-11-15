package cz.novanadeje.app.donations.domain.importing;

import java.time.Instant;
import java.util.List;

public interface ImportAlertRepository {

    void add(ImportAlert alert, Instant at);

    List<WaitingImportAlert> waiting();

    void markSent(ImportAlertId id, Instant at);

    void dropWaitingOutages(Instant at);
}
