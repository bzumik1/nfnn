package cz.novanadeje.app.donations.application.importing;

import cz.novanadeje.app.donations.domain.importing.BankImportState;
import cz.novanadeje.app.donations.domain.importing.BankImportStateRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ImportStatusService {

    private final BankImportStateRepository states;

    public ImportStatusService(BankImportStateRepository states) {
        this.states = states;
    }

    @Transactional(readOnly = true)
    public BankImportState currentState() {
        return states.current();
    }
}
