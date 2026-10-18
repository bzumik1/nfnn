package cz.novanadeje.app.support;

import cz.novanadeje.app.donations.application.importing.BankImportProperties;
import cz.novanadeje.app.donations.application.importing.BankImportRequests;
import cz.novanadeje.app.donations.application.importing.ImportBankPaymentsService;

public class SynchronousBankImportRequests implements BankImportRequests {

    private final ImportBankPaymentsService imports;
    private final BankImportProperties properties;

    public SynchronousBankImportRequests(ImportBankPaymentsService imports, BankImportProperties properties) {
        this.imports = imports;
        this.properties = properties;
    }

    @Override
    public void requestImport() {
        imports.importOnDemand(properties.toSettings(), properties.onDemandCooldown());
    }

    @Override
    public boolean inProgress() {
        return false;
    }
}
