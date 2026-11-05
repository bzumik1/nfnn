package cz.novanadeje.app.donations.application.importing;

import java.time.Instant;
import java.time.LocalDate;

public interface BankImportRequests {

    void requestImport();

    boolean inProgress();

    boolean enabled();

    void requestHistoryImport(LocalDate from, Instant at);
}
