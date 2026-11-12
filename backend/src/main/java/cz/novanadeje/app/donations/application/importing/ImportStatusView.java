package cz.novanadeje.app.donations.application.importing;

import cz.novanadeje.app.donations.domain.importing.BankImportState;

import java.time.LocalDate;
import java.util.Optional;

public record ImportStatusView(BankImportState state, Optional<HistoryImportRun> historyImport, LocalDate defaultHistoryFrom) {
}
