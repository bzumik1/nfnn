package cz.novanadeje.app.donations.application.importing;

import cz.novanadeje.app.donations.domain.importing.BankImportStateRepository;
import org.springframework.stereotype.Service;

import java.time.Clock;

@Service
public class BankCheckService {

    private final BankImportStateRepository states;
    private final BankImportRequests imports;
    private final BankImportProperties properties;
    private final Clock clock;

    public BankCheckService(BankImportStateRepository states, BankImportRequests imports, BankImportProperties properties, Clock clock) {
        this.states = states;
        this.imports = imports;
        this.properties = properties;
        this.clock = clock;
    }

    public BankCheck requestCheck() {
        if (!states.current().attemptedWithin(properties.onDemandCooldown(), clock.instant())) {
            imports.requestImport();
        }
        return currentCheck();
    }

    public BankCheck currentCheck() {
        return new BankCheck(states.current().lastSucceededAt(), imports.inProgress());
    }
}
