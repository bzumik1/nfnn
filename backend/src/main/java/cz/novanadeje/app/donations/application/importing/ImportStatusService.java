package cz.novanadeje.app.donations.application.importing;

import cz.novanadeje.app.donations.domain.importing.BankCalendar;
import cz.novanadeje.app.donations.domain.importing.BankImportStateRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;

@Service
public class ImportStatusService {

    private final BankImportStateRepository states;
    private final HistoryImportTracker historyImports;
    private final BankImportProperties properties;
    private final Clock clock;

    public ImportStatusService(BankImportStateRepository states, HistoryImportTracker historyImports, BankImportProperties properties, Clock clock) {
        this.states = states;
        this.historyImports = historyImports;
        this.properties = properties;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public ImportStatusView currentState() {
        LocalDate defaultHistoryFrom = properties.toSettings().historyFrom()
                .orElseGet(() -> BankCalendar.today(clock).withDayOfYear(1));
        return new ImportStatusView(states.current(), historyImports.last(), defaultHistoryFrom);
    }
}
